# Pruebas de carga

Simulan una salida a la venta contra **producción**, antes de tener eventos reales
a la venta. Miden la infraestructura completa: Cloudflare, proxy, API, Redis y
MySQL.

> Correr solo mientras no haya ventas reales. Cada corrida genera usuarios,
> órdenes y reservas de stock de prueba; `cleanup.js` los borra.

## Qué se prueba

| Escenario | Archivo | Qué mide |
|---|---|---|
| Navegación | `k6/browse.js` | Listado, detalle y mapa del evento con cientos de peticiones por segundo |
| Salida a la venta | `k6/on-sale.js` | N compradores que en ~30 s inician sesión, abren el evento y reservan entradas |
| Sobreventa | `scripts/verify-stock.js` | Después de `on-sale.js`: que no se haya reservado ni vendido más que el cupo |

No se prueba el pago: es Mercado Pago y no se puede simular. Las órdenes quedan
`pending_payment` y se cancelan al final (o vencen a los 10 minutos).

## Preparación (una vez)

### 1. Evento de prueba

Crearlo desde el panel de productora, **publicado**, con la venta abierta y
tandas con el cupo que se quiera probar. Para probar sobreventa, poner **menos
cupo que compradores** (ej. 500 entradas para 2.000 compradores). Anotar su
`uuid` y su `slug`.

### 2. Compradores de prueba

Desde la carpeta del backend (el `.env` tiene que apuntar a la base de
producción):

```bash
export LOAD_TEST_PASSWORD='una-contraseña-larga-solo-para-pruebas'
node load-tests/scripts/seed-users.js --count 2000
```

Crea usuarios `loadtest+00001@showpass-loadtest.invalid`… listos para comprar
(email verificado, documento cargado, sin 2FA). El dominio `.invalid` no existe:
nunca sale un correo real.

### 3. Pase para el límite de peticiones

La API limita a 60 peticiones por minuto por IP. k6 corre desde una sola
máquina, así que sin pase la prueba se frena en segundos.

En el servidor, agregar al `.env` de `showpass-api` y reiniciar el contenedor:

```bash
LOAD_TEST_BYPASS_TOKEN=$(openssl rand -hex 32)
```

Las peticiones con ese valor en el header `x-load-test-token` no cuentan para el
límite. **Al terminar la ventana de pruebas, dejar la variable vacía y reiniciar.**

## Correr

Todo con Docker, desde la carpeta del backend.

```bash
export BYPASS_TOKEN='el mismo valor que LOAD_TEST_BYPASS_TOKEN'
export EVENT_UUID='...'
export EVENT_SLUG='...'
```

### Corrida 0 — el límite es por comprador

Confirma que el límite de 60/min se cuenta por comprador y no por Cloudflare.
Correr **sin** `BYPASS_TOKEN`, para agotar a propósito el cupo de tu IP:

```bash
docker run --rm -v "$PWD/load-tests/k6:/scripts" grafana/k6 run \
  -e EVENT_UUID -e EVENT_SLUG -e LOAD_TEST_PASSWORD -e BUYERS=100 /scripts/on-sale.js
```

Mientras corre, abrir el sitio desde **el celular con datos móviles** (otra IP)
e iniciar sesión.

- k6 recibe 429: esperable, todo sale de tu IP.
- El celular navega y entra normal: el límite es por comprador. ✅
- El celular también recibe "demasiadas peticiones": todos comparten cupo detrás
  de Cloudflare, y una salida a la venta real fallaría. ❌

### Corrida 1 — navegación

```bash
docker run --rm -v "$PWD/load-tests/k6:/scripts" grafana/k6 run \
  -e EVENT_UUID -e EVENT_SLUG -e BYPASS_TOKEN -e PEAK_RPS=200 /scripts/browse.js
```

Subir `PEAK_RPS` por escalones (200 → 500 → 1000) mientras `http_req_failed`
siga debajo del 1 %.

### Corrida 2 — salida a la venta

```bash
docker run --rm -v "$PWD/load-tests/k6:/scripts" grafana/k6 run \
  -e EVENT_UUID -e EVENT_SLUG -e BYPASS_TOKEN -e LOAD_TEST_PASSWORD \
  -e BUYERS=500 -e RAMP_SECONDS=30 /scripts/on-sale.js
```

Escalones: `BUYERS=500` → `2000` → `5000`. Frenar en el primero que dé
`responses_5xx` o un p95 de `POST /orders` arriba de 2 s. Para 5.000 hacen falta
5.000 usuarios sembrados.

Después de cada corrida:

```bash
node load-tests/scripts/verify-stock.js --event "$EVENT_UUID"
```

Sale con error si hubo sobreventa.

## Qué mirar

| Métrica k6 | Bien | Mal |
|---|---|---|
| `responses_5xx` | 0 | Cualquier valor: la API se rompió bajo carga |
| `http_req_duration{name:POST /orders}` p95 | < 2 s | Comprador esperando con el stock en juego |
| `http_req_duration{name:POST /auth/login}` p95 | < 2 s | bcrypt saturando la CPU |
| `orders_sold_out` | Solo cuando la demanda supera el cupo | Agotado con stock libre = desfasaje Redis/MySQL |
| `responses_429` | 0 con pase | Con pase: el guard no reconoce el token |
| `verify-stock.js` | Sin sobreventa | Cualquier sobreventa |

En el servidor, en paralelo:

```bash
cd /docker/showpass
docker stats --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" $(docker ps --filter name=showpass-showpass-api --format "{{.Names}}")
docker compose logs -f --tail 20 showpass-api
```

La API corre en 6 réplicas (`showpass-showpass-api-1..6`): los comandos `docker`
van con el nombre de cada contenedor; los `docker compose`, con el del servicio
(`showpass-api`), y abarcan las 6.

## Post-pago: QR, PDF y emails

Mide cuánto tarda en llegar la última entrada cuando se pagan muchas órdenes
juntas. No pasa por Mercado Pago: `confirm-test-orders` llama al mismo
`confirmPayment` que el webhook, y de ahí en adelante todo es real (entradas,
colas, PDF, email).

Cada orden es un email real por el SMTP del servidor (el mismo de las compras
reales). Subir de a escalones (50 → 200 → 500) y frenar si aparecen rechazos
del servidor de correo.

1. Redirigir los emails de prueba a una casilla propia (`user.email` es único:
   quedan como `info+loadtest-00001@showpass.com.ar`):

   ```bash
   node load-tests/scripts/redirect-emails.js --to info@showpass.com.ar
   ```

2. Crear órdenes pendientes (viven 10 minutos, los pasos 2 a 3 van seguidos):

   ```bash
   docker run --rm -i -v "$PWD/load-tests/k6:/scripts" grafana/k6 run \
     -e EVENT_UUID -e EVENT_SLUG -e BYPASS_TOKEN -e LOAD_TEST_PASSWORD \
     -e BUYERS=50 -e PRELOGIN=1 -e CANCEL=0 /scripts/on-sale.js
   ```

3. En el servidor, pagarlas:

   ```bash
   cd /docker/showpass
   docker compose run --rm --no-deps -T showpass-api \
     node dist/scripts/load-test/confirm-test-orders.js --event <uuid> --limit 50
   ```

   Imprime la hora de inicio.

4. Seguir la generación desde la PC y los emails en el servidor:

   ```bash
   node load-tests/scripts/watch-delivery.js --event "$EVENT_UUID" --since <hora del paso 3>
   docker compose logs --since 30m showpass-api | grep -c "Tickets email sent"
   docker compose logs --since 30m showpass-api | grep -i "No se pudo enviar el email"
   ```

5. Devolver los emails antes de limpiar:

   ```bash
   node load-tests/scripts/redirect-emails.js --restore
   ```

Bien: todas las entradas con PDF en menos de 2 minutos, emails enviados = órdenes,
ninguna alerta de "Entradas que no salieron" en el panel.

## Limpieza

Con las órdenes ya vencidas o canceladas. Si hubo órdenes pagadas, el script
devuelve el cupo en MySQL, resta el resumen de fees e imprime los `INCRBY` de
Redis para correr en el servidor:

```bash
node load-tests/scripts/cleanup.js            # muestra qué borraría
node load-tests/scripts/cleanup.js --confirm  # borra
```

Solo toca usuarios `@showpass-loadtest.invalid` y lo que generaron. El evento de
prueba se borra aparte, desde el panel.
