# Auditoría de performance (DB) y reorganización de Swagger

Etapa 1 — camino a producción. Relevamiento sobre `src/config/db/entities/`,
`src/migrations/` y los servicios que arman las consultas reales.

---

## Parte 1 — Base de datos

### 1.1 Estado actual (lo que está bien)

El esquema está mejor de lo que suele estar un MVP en esta etapa:

- **Todas las FKs de las tablas nuevas existen** (coupon, payout, stock_alert,
  event_cash, org_mp, event_map). InnoDB crea índice automático para cada columna
  con FK, así que las columnas `*Uuid` que son FK ya están cubiertas.
- Hay composites bien pensados: `orders(status, expiresAt)` para el job de
  expiración, `event_expense(eventUuid, isDeleted)`, `event_income(eventUuid,
  occurredAt)`, `payout(organizationUuid, transferredAt)`,
  `user_notification(userUuid, createdAt)`.
- Unicidades correctas donde importa: `event.slug`, `orders.orderNumber`,
  `ticket.ticketNumber`, `ticket.qrCode`, `payment(provider, providerPaymentId)`,
  `coupon(eventUuid, code)`, `event_fee_summary.eventUuid`.

**Ninguna entidad usa `@Index`.** Todo el esquema vive en migraciones
(`synchronize: false`), lo cual es correcto, pero significa que el modelo TS no
documenta los índices. Recomendación de convención (no urgente): agregar los
`@Index` en las entidades como documentación, sin dejar que TypeORM los genere.

---

### 1.2 Índices faltantes — por impacto

#### 🔴 Crítico

**1. `event` — listado público sin índice utilizable**

```sql
WHERE isActive = 1 AND isPublished = 1 AND endDate >= NOW()
  AND name LIKE '%…%'   [+ venueCity, venueCountry, startDate BETWEEN]
ORDER BY startDate ASC LIMIT ?
```

Los únicos índices son `slug`, `organizationUuid` y `startDate`. Ninguno filtra
`isPublished`/`isActive`/`endDate`, así que MySQL escanea todo el catálogo y
descarta. Es el endpoint más caliente del sistema (home pública).

→ `IDX_event_public_listing (isPublished, isActive, endDate, startDate)`

**2. `orders` — reporting y dashboard**

```sql
FROM order_item oi
JOIN orders o ON o.uuid = oi.orderUuid
WHERE o.status IN ('paid','refunded') AND o.eventUuid IN (…)
  AND o.createdAt BETWEEN ? AND ?
ORDER BY o.createdAt DESC
```

Hoy hay `eventUuid` y `status` por separado: MySQL elige uno, filtra el resto en
memoria y ordena con filesort. Con volumen de producción esto es el primer
cuello de botella del panel del productor.

→ `IDX_orders_event_status_createdAt (eventUuid, status, createdAt)`

**3. `user.dni` sin índice — búsqueda en puerta**

`POST /check-in/find-by-document` hace `u.dni = :document` sobre la tabla de
usuarios completa. Es un full scan en el peor momento posible (fila de acceso al
evento, red mala, timeout de 10s del scanner).

→ `IDX_user_dni (dni)`

**4. `orders.couponUuid` — sin índice y sin FK**

La migración `CreateCoupon` agregó `couponUuid` y `discountAmount` a `orders`
pero no creó ni índice ni foreign key. Dos consecuencias: nada impide que una
orden apunte a un cupón inexistente, y cualquier conteo de uso por cupón hace
full scan de `orders`.

→ `IDX_orders_couponUuid` + `FK_orders_coupon` (`ON DELETE SET NULL`)

**5. `coupon_redemption.orderUuid` — FK faltante**

`coupon_redemption` tiene FK a `coupon` pero no a `orders`, aunque el unique
`UQ_coupon_redemption_order` asume la relación. Una redención puede sobrevivir a
su orden.

→ `FK_coupon_redemption_order` (`ON DELETE CASCADE`)

#### 🟠 Alto

| Tabla | Consulta | Índice propuesto |
|---|---|---|
| `ticket` | contador en vivo y validación: `eventUuid = ? AND status IN (…)` | `(eventUuid, status)` — reemplaza `IDX_ticket_eventUuid` |
| `ticket` | "mis tickets" ordenado por fecha | `(userUuid, createdAt)` — reemplaza `IDX_ticket_userUuid` |
| `orders` | "mis órdenes": `userUuid [+ status] ORDER BY createdAt DESC` | `(userUuid, status, createdAt)` |
| `event` | backoffice del productor: sus orgs ordenadas por fecha | `(organizationUuid, startDate)` |
| `user_notification` | badge de no leídas: `userUuid AND readAt IS NULL` | `(userUuid, readAt)` |

#### 🟡 Medio

| Tabla | Consulta | Índice propuesto |
|---|---|---|
| `check_in_log` | auditoría por evento en orden cronológico | `(eventUuid, scannedAt)` |
| `event_media` | portada del listado: `eventUuid + isDeleted IS NULL ORDER BY sortOrder` | `(eventUuid, isDeleted, sortOrder)` |
| `ticket_type` | tandas activas de un evento ordenadas | `(eventUuid, isActive, sortOrder)` |
| `event_income` | listado de caja (agrega `isDeleted IS NULL`) | `(eventUuid, isDeleted, occurredAt)` |
| `mp_movement` | ídem movimientos MP | `(eventUuid, isDeleted, occurredAt)` |
| `payout` | listado (agrega `isDeleted IS NULL`) | `(organizationUuid, isDeleted, transferredAt)` |

Todo esto está implementado en:
**`src/migrations/1785900000000-PerformanceIndexes.ts`** (creada, **no ejecutada**).

---

### 1.3 Índices redundantes a limpiar

Después de aplicar la migración quedan cubiertos por prefijo de un composite y
se pueden borrar (la migración ya borra los tres primeros):

- `IDX_ticket_eventUuid` → cubierto por `(eventUuid, status)`
- `IDX_ticket_userUuid` → cubierto por `(userUuid, createdAt)`
- `IDX_payout_org_transferred` → cubierto por `(organizationUuid, isDeleted, transferredAt)`
- `IDX_event_organizationUuid` → cubierto por `(organizationUuid, startDate)`
  *(la migración lo deja: es el índice que respalda la FK a `organization`; se
  puede borrar porque InnoDB acepta un composite con la columna como prefijo,
  pero lo dejé fuera para no tocar una FK viva en la primera pasada)*
- `IDX_orders_status` y `IDX_orders_eventUuid` → quedan como prefijos parciales
  de los nuevos composites. `IDX_orders_status` es de baja selectividad
  (5-6 valores) y aporta poco; evaluarlo después de medir.

---

### 1.4 Hallazgos que no son índices, pero conviene resolver antes de producción

**a) `ILike` en MySQL descarta índices.** *(corregido — era peor de lo que decía
la primera versión de este informe)*

`event.service.ts`, `user.service.ts`, `organization.service.ts` y `role.service.ts`
usaban `ILike` de TypeORM. Revisado el código de TypeORM 0.3.30
(`query-builder/QueryBuilder.js`, `case "ilike"`): fuera de Postgres/CockroachDB
lo traduce a `UPPER(columna) LIKE UPPER(?)`. Envolver la columna en `UPPER()` la
vuelve **no-sargable**: MySQL no puede usar ningún índice sobre esa columna, y
además evalúa la función fila por fila. No era cosmético.

Con collation `*_ci` (la default) el `LIKE` plano ya es case-insensitive, así que
`Like` es equivalente en resultado y estrictamente más barato. **Reemplazado en
las 25 apariciones.**

**b) SQL de Postgres colado en `user.service.ts:69`**

```ts
firstName: Raw(alias => `LOWER(CONCAT(${alias}, ' ', "lastName")) LIKE LOWER(:search)`, …)
```

Las comillas dobles alrededor de `"lastName"` son identificadores de Postgres. En
MySQL, sin `ANSI_QUOTES`, `"lastName"` es el **literal string** `lastName`, no la
columna: esa búsqueda concatena el nombre con la palabra "lastName" y nunca
matchea. Es un bug funcional, no de performance. → usar `` `lastName` ``.

**c) `user.email` no es único.**
`IDX_user_email` es un índice común. El login busca por email; dos usuarios con
el mismo email es un problema de seguridad, no de velocidad. Antes de poner el
unique hay que verificar duplicados existentes:
`SELECT email, COUNT(*) FROM user GROUP BY email HAVING COUNT(*) > 1;`

**d) Tipos inconsistentes en columnas UUID.**
Conviven `char(36)` (check_in_log, event, ticket, orders…) y `varchar(36)`
(coupon, payout, stock_alert, event_map…). Ambos funcionan, pero un JOIN entre
`char(36)` y `varchar(36)` con collations distintas puede impedir el uso del
índice. Vale un chequeo:
`SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='tickets_db' AND COLUMN_NAME LIKE '%Uuid' ORDER BY 3;`

**e) Entidades con `@Column({ type: 'char' })` sin `length`.**
`user_organization.userUuid`, `user_organization.organizationUuid`,
`user_role.userUuid`, `user_role.roleUuid`, `user_token_session.userUuid`.
Como `synchronize: false`, no afecta al esquema real, pero cualquiera que lea la
entidad ve `char(1)`. Corregir a `varchar(36)` para que el modelo no mienta.

**f) `LIKE '%término%'` nunca usa índice.**
Las búsquedas de eventos, usuarios y organizaciones son todas con comodín
inicial. Los índices propuestos ayudan al resto del `WHERE` (que es lo que
reduce el conjunto), pero el `LIKE` en sí siempre escanea lo que quede. Cuando el
volumen lo pida, la salida es un `FULLTEXT INDEX` sobre `event.name` /
`event.description` y `MATCH … AGAINST`. No hace falta ahora; sí conviene tenerlo
identificado.

---

## Parte 2 — Swagger

### 2.1 Problemas actuales

**a) El orden declarado se ignora.**
`swagger.ts` declara 12 tags en un orden pensado, pero después configura
`tagsSorter: 'alpha'` y `operationsSorter: 'alpha'`. Swagger UI ordena todo
alfabéticamente y descarta el orden del `DocumentBuilder`. Por eso "Admin —
Tickets" aparece arriba de todo y "Users" al final.

→ **Quitar `tagsSorter` y `operationsSorter`.** Sin ellos, Swagger UI respeta el
orden de `.addTag()` para las secciones y el orden de declaración de métodos
dentro del controller para los endpoints. Eso hace el orden *controlable*.

**b) 12 tags declarados, 24 tags en uso.**
Estos se usan en controllers pero no están en `swagger.ts`, así que aparecen al
final, sin descripción: `Backoffice`, `Notifications`, `Support`,
`Producer — Cupones`, `Producer — Caja`, `Producer — Catálogo`,
`Producer — Mercado Pago`, `Producer — Liquidaciones`, `Producer — Eventos`,
`Producer — Reporting`, `Producer — Alertas de stock`, `Admin — Liquidaciones`.

**c) `Events` tiene ~45 endpoints en un solo tag.**
`event.controller.ts` mezcla ocho responsabilidades distintas: CRUD del evento,
ciclo de vida, mapa de sectores, banners y galería, productores, validadores,
tipos de entrada y gastos. Es el problema que planteaste, y es el más caro de
convivir: para encontrar "borrar una tanda" hay que scrollear entre uploads de
imágenes.

**d) Nomenclatura mezclada.**
Tags en inglés (`Events`, `Orders`, `Tickets`) conviven con tags en español con
guión largo (`Producer — Cupones`). Los `summary` están casi todos en inglés
(`'Create event'`, `'List my orders'`) pero algunos en español
(`'Home unificado de backoffice (por rol activo)'`,
`'Generar token de larga duración para APIs internas'`).

---

### 2.2 Taxonomía propuesta

Tres decisiones de fondo:

1. **Un tag = un CRUD o un sub-recurso.** Si un tag pasa de ~12 endpoints, se parte.
2. **Prefijo por audiencia**, que es como realmente se busca un endpoint:
   `Public` (sin auth o cliente final) · `Producer` (backoffice de productora) ·
   `Admin` (rol Administrador) · `Staff` (validador/caja) · `System`.
3. **Todo en español**, que es el idioma del equipo y de la documentación
   funcional en `tickets-frontend/docs/`.

```
── Plataforma ──────────────────────────────────────────
01. Auth                          — login, registro, 2FA, recupero
02. Perfil                        — /auth/me, cambio de password, baja
03. Notificaciones                — notificaciones del usuario
04. Soporte                       — contacto

── Público / comprador ─────────────────────────────────
10. Público — Eventos             — listado, detalle, by-slug, mapa público
11. Compra — Órdenes              — crear, listar, detalle, cancelar
12. Compra — Pagos                — initialize, webhook, consulta
13. Compra — Tickets              — mis tickets, detalle

── Productora ──────────────────────────────────────────
20. Productora — Organización     — datos fiscales, validación, cambios
21. Productora — Staff            — validadores, caja, invitaciones
22. Productora — Eventos          — CRUD del evento
23. Productora — Ciclo de vida    — publicar, despublicar, cancelar, cerrar ventas, cambios
24. Productora — Tandas           — ticket types (CRUD + bulk)
25. Productora — Multimedia       — banners y galería
26. Productora — Mapa             — sectores, imagen base, sugerencias IA
27. Productora — Equipo del evento— productores y validadores asignados
28. Productora — Cupones          — CRUD de cupones
29. Productora — Alertas de stock — CRUD de alertas
30. Productora — Gastos           — gastos del evento
31. Productora — Caja             — ingresos, resumen, movimientos MP
32. Productora — Mercado Pago     — cuentas OAuth y catálogo
33. Productora — Liquidaciones    — payouts recibidos
34. Productora — Reportes         — ventas, export, dashboard del evento

── Staff en puerta ─────────────────────────────────────
40. Acceso — Check-in             — validar QR, buscar por documento, contador

── Administración ──────────────────────────────────────
50. Admin — Organizaciones        — aprobar/rechazar, alta, listado
51. Admin — Usuarios              — CRUD de usuarios
52. Admin — Roles                 — CRUD de roles
53. Admin — Liquidaciones         — registrar payouts, comprobantes
54. Admin — Tickets               — regenerar QR
55. Admin — Backoffice            — home y dashboard consolidado
56. Admin — Parámetros            — system parameters, token interno
```

**Cómo se aplica sin romper URLs.** El tag es metadato de OpenAPI, no ruta. Se
puede reorganizar todo el Swagger **sin tocar un solo path** poniendo
`@ApiTags(...)` a nivel de método en vez de a nivel de clase. `event.controller.ts`
queda con las mismas rutas pero repartido en 7 tags. Si después querés partir el
controller en varios archivos, ya está agrupado.

### 2.3 Convención de títulos (`summary`)

Un patrón fijo hace que el título alcance para identificar el endpoint:

```
<Verbo> <recurso> [— <matiz>]
```

- **Verbos permitidos**: `Listar`, `Obtener`, `Crear`, `Actualizar`, `Eliminar`,
  `Publicar`, `Cancelar`, `Asignar`, `Quitar`, `Subir`, `Descargar`, `Exportar`,
  `Validar`, `Aprobar`, `Rechazar`, `Sincronizar`.
- **Recurso en singular para uno, plural para listado**: `Obtener evento` /
  `Listar eventos`.
- **El matiz va después del guión**, no en el verbo:
  `Eliminar evento — baja lógica`, `Listar ventas — export CSV`.
- **Nunca repetir el tag en el summary**: dentro de "Productora — Tandas" el
  título es `Crear tandas (bulk)`, no `Crear tipos de entrada del evento`.

Antes / después, algunos reales:

| Hoy | Propuesto | Tag |
|---|---|---|
| `Create event` | `Crear evento` | Productora — Eventos |
| `Delete event (soft)` | `Eliminar evento — baja lógica` | Productora — Eventos |
| `Unpublish event (draft)` | `Despublicar evento` | Productora — Ciclo de vida |
| `Create ticket types (bulk)` | `Crear tandas (bulk)` | Productora — Tandas |
| `Upload event banner (per platform)` | `Subir banner — por variante` | Productora — Multimedia |
| `Search users to assign as validators` | `Buscar candidatos a validador` | Productora — Equipo del evento |
| `Home unificado de backoffice (por rol activo)` | `Obtener home de backoffice` | Admin — Backoffice |
| `Find tickets by document` | `Buscar tickets por documento` | Acceso — Check-in |
| `Generar token de larga duración para APIs internas` | `Generar token interno` | Admin — Parámetros |

### 2.4 Orden de endpoints dentro de cada tag

Sin `operationsSorter`, manda el orden de declaración en el controller. Convención:

```
1. Listar        (GET /)
2. Obtener       (GET /:id)
3. Crear         (POST /)
4. Actualizar    (PATCH/PUT /:id)
5. Eliminar      (DELETE /:id)
6. Acciones      (POST /:id/accion)
```

Hoy `event.controller.ts` arranca con `POST /` y los dos endpoints de IA antes
del listado — reordenar los métodos dentro del archivo alcanza para arreglarlo.

---

## Estado de ejecución

### ✅ Aplicado

| Paso | Estado |
|---|---|
| `1785900000000-PerformanceIndexes` (15 índices, 2 FKs, 3 índices redundantes borrados) | corrida en la DB |
| `1785910000000-UserUsernameIndex` (índice en `user.username`) | **creada, pendiente de correr** |
| Swagger: `tagsSorter`/`operationsSorter` eliminados, 33 tags declarados en orden | aplicado |
| Swagger: `Events` partido en 7 tags a nivel de método (44 endpoints, mismas rutas) | aplicado |
| Swagger: `Auth` partido en `Auth` + `Perfil` (16 endpoints) | aplicado |
| Swagger: `Organizations` partido en `Productora — Organización` + `Productora — Staff` + `Admin — Organizaciones` (32 endpoints) | aplicado |
| Swagger: 175 `summary` traducidos y normalizados a la convención | aplicado |
| Convenciones documentadas en `CLAUDE.md` | aplicado |

Verificación de la migración: `scripts/verify-performance-indexes.sql`
(chequea los 15 índices, los 3 borrados, las 2 FKs, y trae el `EXPLAIN` de las
5 consultas críticas).

### ⏳ Pendiente

| # | Acción | Estado |
|---|---|---|
| 1 | `1785910000000-UserUsernameIndex` | ✅ corrida |
| 2 | `Raw` de `user.service.ts` corregido (`"lastName"` era literal en MySQL) | ✅ |
| 3 | Orden de endpoints por `sortOperations()` en `swagger.ts` | ✅ |
| 4 | `ILike` → `Like` (25 apariciones) | ✅ |
| 5 | `@Column({ type: 'char' })` sin `length` en 5 columnas → `varchar(36)` | ✅ |
| 6 | `UNIQUE` en `user.email` | ⏳ migración `1785920000000` corregida, lista para correr |

> **Nota del primer intento (falló y se corrigió):** la versión original borraba
> `IDX_user_email` antes de crear `UQ_user_email` y MySQL devolvió
> `ER_DROP_INDEX_FK`: ese índice es el que cubre la FK de
> `user_password_reset.email` → `user(email)`, e InnoDB no lo suelta mientras sea
> el único. La DB quedó intacta (el `DROP` falla antes de tocar nada y el chequeo
> de duplicados ya había pasado: **no hay emails duplicados**). Corregido: primero
> se crea el unique, que pasa a cubrir la FK, y después se borra el viejo.
| 7 | `FULLTEXT` sobre `event.name` cuando el volumen lo pida | diferido |

### Sobre el orden de endpoints

No se reordenaron los métodos dentro de los controllers, a propósito: en Nest el
orden de declaración **resuelve rutas**. Aplicar la convención literalmente
habría movido `@Get(':organizationUuid')` por encima de `@Get('users')`,
`@Get(':userId')` por encima de `@Get('list')` y `@Get(':eventUuid')` por encima
de `@Get('by-slug/:slug')` — tres rutas rotas en silencio.

El orden visual se resuelve en `sortOperations()` (`swagger.ts`), que ordena el
documento OpenAPI por el verbo del `summary`. Misma convención, cero riesgo de
routing, y un solo lugar donde cambiarla.

## Plan original

| # | Acción | Riesgo |
|---|---|---|
| 1 | Correr `EXPLAIN` de las 5 queries críticas contra la DB actual para tener línea de base | nulo |
| 2 | Aplicar `1785900000000-PerformanceIndexes.ts` | bajo — solo índices y 2 FKs |
| 3 | Verificar que las 2 FKs nuevas no fallen por datos huérfanos (ver query abajo) | — |
| 4 | Corregir el `Raw` de `user.service.ts:69` | bajo |
| 5 | Quitar `tagsSorter`/`operationsSorter` y declarar los 24 tags en orden | nulo |
| 6 | Mover `@ApiTags` a nivel de método en `event.controller.ts` (7 tags) | nulo |
| 7 | Renombrar los `summary` según la convención, controller por controller | nulo |
| 8 | Reordenar métodos dentro de cada controller | nulo |
| 9 | Evaluar unique en `user.email` | medio — requiere limpiar duplicados |

Chequeo previo al paso 2 (huérfanos que harían fallar las FKs):

```sql
SELECT COUNT(*) FROM orders o
  LEFT JOIN coupon c ON c.uuid = o.couponUuid
  WHERE o.couponUuid IS NOT NULL AND c.uuid IS NULL;

SELECT COUNT(*) FROM coupon_redemption cr
  LEFT JOIN orders o ON o.uuid = cr.orderUuid
  WHERE o.uuid IS NULL;
```

Ambos deben dar 0. Si no, hay que limpiar antes.
