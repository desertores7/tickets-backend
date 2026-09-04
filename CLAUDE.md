# CLAUDE.md — Contexto del proyecto Ticketera (tickets-backend)

## Qué es este proyecto

Backend de una plataforma de venta de entradas (ticketera) tipo Passline, para el mercado argentino. MVP en desarrollo activo con visión de crecimiento a largo plazo.

## Stack tecnológico

- **Framework**: NestJS (monolito modular — NO microservicios por ahora)
- **Base de datos**: MySQL 8 con TypeORM — **IMPORTANTE: NO es PostgreSQL**
- **Cache / operaciones atómicas**: Redis (ioredis)
- **Colas de trabajo**: BullMQ sobre Redis
- **Package manager**: pnpm
- **Pagos**: Mercado Pago (Checkout Pro, cuenta única)
- **Storage de archivos**: disco local con volumen Docker — **NO S3/R2** (migración futura posible)
- **Email**: Gmail SMTP con contraseña de aplicación (nodemailer) — solo para desarrollo/MVP
- **Contenedores**: Docker + docker-compose (api, redis, volumen tickets_storage). MySQL corre en el HOST, no en Docker — el contenedor se conecta vía `host.docker.internal`

## Reglas de MySQL (crítico)

- NO usar tipos de PostgreSQL: no `uuid` nativo, no `jsonb`, no `CREATE INDEX CONCURRENTLY`
- UUIDs como `varchar(36)`, generados en JS con la librería `uuid`
- Campos JSON como tipo `json` de MySQL
- ENUMs inline como tipo de columna (`ENUM('a','b')`), no tipos separados
- Timestamps con `DEFAULT CURRENT_TIMESTAMP`
- Transacciones con `QueryRunner` de TypeORM (`dataSource.createQueryRunner()`), con COMMIT/ROLLBACK explícito y `release()` en bloque `finally`
- Para upserts atómicos usar `INSERT ... ON DUPLICATE KEY UPDATE` con SQL raw vía `queryRunner.query()` (TypeORM no lo genera nativo)

## Convenciones de arquitectura del proyecto

Cada módulo en `src/modules/<nombre>/` sigue esta estructura:

```
modules/<nombre>/
├── controllers/
│   ├── <nombre>.controller.ts
│   └── dtos/  (o requests/ y responses/ según el módulo)
│       └── <accion>/<accion>.request.ts / .response.ts
├── services/
│   ├── contracts/i<nombre>.service.ts   ← interface
│   ├── core/<nombre>.ts                 ← objeto de dominio (si aplica)
│   └── implementation/<nombre>.service.ts
└── processors/                          ← processors de BullMQ (si aplica)
```

- Módulos se registran en `src/modules/controller.module.ts` y `src/modules/service.module.ts`
- Entidades TypeORM en `src/config/db/entities/` (registrarlas en el sistema de entidades existente)
- Migraciones en `src/migrations/` siguiendo el patrón de `1781635200000-InitialSchema.ts`. Las columnas FK a UUIDs deben ser `varchar(36)` (NO `char(36)`) — InnoDB rechaza FKs entre tipos distintos y todas las PKs existentes son `varchar(36)`
- Migraciones en producción (dentro del contenedor, sobre código compilado — el script pnpm con ts-node NO funciona ahí): `docker exec -e NODE_ENV=production tickets-backend-api-1 node node_modules/typeorm/cli.js migration:run -d dist/config/db/data-source.js`
- Variables de entorno via `EnvService` (`src/config/env/`) — toda variable nueva se agrega a `env.config.ts` y `env.service.ts`, y al `.env.example`
- DTOs con `class-validator` / `class-transformer`
- Decoradores compartidos existentes: `@PaginationQuery`, `@FilterQuery`, `@SearchQuery`, `@OrderQuery`, `@User()`
- Guards existentes: `role.guard`, `internal-token.guard` + decoradores de auth (`@UserAuth`, `@AdminAuth`, `@ValidatorAuth`)
- **Roles reales en la DB (seeds)**: `Administrador`, `Operador`, `Validador` — los decoradores deben usar EXACTAMENTE estos nombres (`RoleGuard` compara contra `role.name`; un nombre inexistente produce 403 para todos)
- Logging con `Logger` de NestJS; exception filter global en `shared/middlewares/exception-filter.filter.ts`
- Documentar todos los endpoints con Swagger siguiendo el patrón de `shared/const/swagger.ts` y `shared/decorators/swagger.decorator.ts`
- Skill de referencia: `.agents/skills/nestjs-best-practices/` — respetar sus reglas (evitar dependencias circulares, repository pattern, transacciones, etc.)

## Convenciones de Swagger

La documentación se ordena por **audiencia**, no por controller. Ver la lista
completa de tags en `src/shared/const/swagger.ts` y el detalle del criterio en
`docs/auditoria-performance-y-swagger.md`.

- **Un tag = un CRUD o un sub-recurso.** Si un tag pasa de ~12 endpoints, se parte.
- **Prefijos de audiencia**: `Público — `, `Compra — `, `Productora — `,
  `Acceso — `, `Admin — `. Sin prefijo solo lo transversal (`Auth`, `Perfil`,
  `Notificaciones`, `Soporte`).
- **Todo en español**, tags y `summary`.
- El orden de las secciones lo da el orden de los `.addTag()` en `swagger.ts`.
  **No agregar `tagsSorter` ni `operationsSorter`**: con `'alpha'` Swagger UI
  reordena alfabéticamente y descarta ese orden.
- Un tag nuevo se declara en `swagger.ts` con descripción; si no, aparece al
  final sin descripción.
- Cuando un controller cubre más de una sección (`event.controller.ts`,
  `auth.controller.ts`, `organization.controller.ts`) **no lleva `@ApiTags` a
  nivel de clase**: cada método declara el suyo. Las rutas no cambian. Nunca
  mezclar tag de clase y de método: NestJS los acumula y el endpoint aparece
  duplicado en dos secciones.

### Convención de títulos (`summary`)

```
<Verbo> <recurso> [— <matiz>]
```

- Verbos: `Listar`, `Obtener`, `Crear`, `Actualizar`, `Eliminar`, `Publicar`,
  `Cancelar`, `Asignar`, `Quitar`, `Subir`, `Descargar`, `Exportar`, `Validar`,
  `Aprobar`, `Rechazar`, `Sincronizar`, `Registrar`.
- Plural para listados, singular para el resto: `Listar tandas` / `Crear tanda`.
- El matiz va después del guión largo: `Eliminar evento — baja lógica`,
  `Exportar ventas — CSV`.
- El summary **no repite el tag**: dentro de `Productora — Tandas` el título es
  `Crear tandas (bulk)`, no `Crear tipos de entrada del evento`.
- **El orden de los endpoints dentro de cada sección NO se controla reordenando
  métodos.** En Nest el orden de declaración resuelve rutas: mover un
  `@Get(':uuid')` por encima de un `@Get('users')` hace que `/users` se
  interprete como un uuid. El orden visual lo resuelve `sortOperations()` en
  `swagger.ts`, que ordena el documento OpenAPI por el verbo del `summary`:
  listar → obtener/descargar → buscar/exportar → crear/registrar/subir →
  actualizar → eliminar → acciones. Un verbo nuevo se agrega a `VERB_RANK`.

## Performance de base de datos

- Índices y FKs revisados en `docs/auditoria-performance-y-swagger.md`.
  Migraciones aplicadas: `1785900000000-PerformanceIndexes`,
  `1785910000000-UserUsernameIndex`.
- Verificación: `scripts/verify-performance-indexes.sql`.
- **InnoDB crea índice automático para toda columna con FOREIGN KEY**: no hace
  falta declarar un índice de una sola columna sobre una FK. Lo que sí hace
  falta son los composites que cubren `WHERE + ORDER BY` juntos.
- Antes de agregar un índice, verificar que respalde una consulta que existe hoy
  en el código. Cada índice cuesta en escritura y en buffer pool.
- **No usar `ILike` de TypeORM.** En MySQL lo traduce a `UPPER(col) LIKE UPPER(?)`,
  y envolver la columna en `UPPER()` la vuelve no-sargable: descarta cualquier
  índice sobre ella. Con collation `*_ci` el `Like` plano ya es
  case-insensitive.
- **No escribir SQL de Postgres en `Raw()`**: `"columna"` entre comillas dobles
  es un identificador en Postgres pero un literal string en MySQL. Usar
  backticks.
- Un composite hace redundante al índice de su columna izquierda: al agregar
  `(a, b)` hay que borrar el `(a)` suelto.
- **Al reemplazar un índice, crear el nuevo ANTES de borrar el viejo.** Si el
  viejo es el único que cubre una columna referenciada por una FK, MySQL
  responde `ER_DROP_INDEX_FK` ("Cannot drop index: needed in a foreign key
  constraint"). Con el nuevo ya creado, la FK se apoya en él y el viejo sale sin
  problema.

## Infraestructura Redis + BullMQ (ya implementada)

- `src/config/redis/redis.module.ts` — módulo global BullMQ
- `src/config/redis/redis.service.ts` — cliente ioredis directo con:
  - Stock atómico: `setStock`, `reserveStock` (Lua script), `releaseStock`, `getStock`
  - Sala de espera: `waitingRoomAdd/Position/Admit/IsAdmitted/ConsumeToken` (Sorted Sets)
  - Idempotencia: `markIdempotency` (SET NX) — usada en webhooks
- Queues definidas en `QUEUE_NAMES`: `tickets`, `notifications`, `payments`, `orders`, `waiting-room`, `maintenance`
- **Regla crítica: una queue = exactamente un processor.** Dos `@Processor()` sobre la misma queue compiten por TODOS los jobs y se pierden silenciosamente (ya pasó una vez con orders/payments). Si un nuevo tipo de job necesita otro worker, crear una queue nueva.
- Mapeo actual: `tickets`→GenerateQrProcessor, `notifications`→SendOrderTicketsEmailProcessor, `payments`→ProcessWebhookProcessor, `orders`→ReleaseExpiredStockProcessor, `maintenance`→CleanupExpiredAssetsProcessor
- Tipos de jobs en `src/config/redis/bull-jobs.types.ts` — todo tipado, sin `any`

## Flujo de compra (implementado)

1. Usuario crea orden → `POST /api/v1/orders` → reserva stock atómica en Redis (Lua DECR) → orden `pending_payment` con `expires_at` +10 min → job BullMQ con delay para liberar stock si expira
2. Usuario inicializa pago → `POST /api/v1/payments/initialize/:orderId` → preferencia de Mercado Pago → el comprador ve items separados: entradas a precio base + ítem "Costo de servicio" aparte (la suma de items debe cerrar exacta con order.total)
3. Webhook de MP → `POST /api/v1/payments/webhook/mercadopago` → idempotencia con Redis → encola job `process-webhook` → responde 200 inmediato
4. Processor confirma pago → transacción MySQL: orden a `paid`, stock confirmado en MySQL, tickets individuales generados, `event_fee_summary` actualizado con upsert atómico → encola jobs `generate-qr` por ticket
5. Processor generate-qr → firma token HMAC-SHA256 → PNG del QR → PDF A6 → guarda en disco local (`storage/tickets/qr/` y `storage/tickets/pdf/`) → actualiza ticket en MySQL
6. Al confirmar pago se encola UN job `send-order-tickets-email` (delay 15s, 6 attempts con backoff) que agrupa todos los tickets de la orden en un solo email con PDFs adjuntos; el processor reintenta si algún PDF aún no fue generado (Gmail SMTP vía `SMTP_*`)
7. Check-in en puerta → `POST /api/v1/check-in/validate` → verifica firma HMAC en memoria ANTES de tocar MySQL → Redis SET NX anti-duplicados → marca ticket como `used` → log de auditoría

## Decisiones de negocio tomadas (NO cambiar sin consultar)

- **Sin split de pagos de Mercado Pago**: se investigó y se descartó. El pago completo entra a la cuenta única de la ticketera; al organizador se le factura la comisión por separado. No hay OAuth por organizador ni `marketplace_fee`.
- **Service fee**: 15% del subtotal, mostrado como ítem separado en el checkout de MP
- **Tabla `event_fee_summary`**: resumen materializado de fees por evento, actualizado con `INSERT ... ON DUPLICATE KEY UPDATE` (atómico, a prueba de pagos concurrentes). Consultable en `GET /api/v1/events/:eventId/fee-summary` (solo organizador dueño o admin)
- **QR firmado**: HMAC-SHA256 con `QR_SECRET`, formato `base64url(payload).base64url(signature)`. Nunca IDs secuenciales.
- **Storage local**: los QR y PDFs viven en el volumen Docker, servidos via `/static/` con ServeStaticModule. La interfaz de `StorageService` (`saveFile`, `deleteFile`, `fileExists`) se mantiene para poder migrar a S3 después sin tocar el resto.
- **Ventana de venta por tanda**: cada `ticket_type` tiene su propia `saleStartDate` y `saleEndDate` (opcionales). El flujo de compra (`order.service.ts`) valida que la tanda esté dentro de su ventana antes de reservar stock. El response DTO incluye un campo `status` calculado (`upcoming` | `available` | `sold_out` | `expired`). Si ambas fechas son `null`, la tanda hereda la ventana del evento. No requirió migración (columnas preexistentes).
- **Reembolsos (pendiente de implementar)**: la política distinguirá motivo — cancelación de evento (reembolso íntegro recomendado) vs arrepentimiento fuera de plazo legal (se retiene el service fee). Referencia: prácticas de Passline y All Access investigadas.

## Estado de los módulos

### Completados
- Auth, User, Organization, Role (base original del proyecto)
- Redis + BullMQ (setup completo)
- Events + TicketType (CRUD, publicación, stock inicial en Redis)
- Orders (reserva atómica, expiración automática, order/order_item/ticket entities)
- Payments (Mercado Pago Checkout Pro, webhook asíncrono, idempotencia)
- Check-in / Gate (validación QR con firma + anti-duplicados)
- QR Generation (firma HMAC, PNG, PDF A6, storage local, endpoints: `GET /tickets/mine`, `GET /tickets/:id`, `POST /admin/tickets/:id/regenerate-qr`)
- Event Fee Summary (tabla + upsert atómico + endpoint de consulta)
- Preferencia MP itemizada (entrada + costo de servicio separados)
- **Notifications**: módulo en `src/modules/notifications/` — `NotificationEmailService` (nodemailer con `SMTP_*`, fallback a las `*_EMAIL` legacy), templates Handlebars en `src/shared/email/templates/` (p. ej. `ticket-email.hbs`; el build los copia a dist), processor `send-order-tickets-email` (único worker de la queue `notifications`). `confirmPayment` encola UN job por orden `{ orderId }` con delay 15s + 6 attempts con backoff; el processor verifica que TODOS los PDFs estén generados (si falta alguno lanza y reintenta) y manda un solo email con todos los PDFs adjuntos. SIN WhatsApp por ahora.
- Scanner web para validadores: página autocontenida en `public/scanner/index.html`, servida en `/scanner` (ServeStatic). Login staff → selección de evento → escaneo continuo con jsQR → `POST /check-in/validate`. Timeout de 10s por request para señal baja.
- Cleanup de assets: job diario 04:00 (queue `maintenance`) que borra QR/PDF de eventos finalizados hace +30 días; conserva ticket, `qrCode` y `check_in_log` (regenerable vía endpoint admin).
- **Validación fiscal productora (FP01 / BR-PROD-002, 011, 014):** wizard bloqueante hasta aprobación Admin; campos banco/CBU/alias separados; identidad fiscal + docs bloqueados post-aprobación; cambio de cuenta vía `POST /organizations/me/bank-change-request` + approve/reject Admin (productora sigue operando). Migración `1784250000000-OrganizationBankFieldsAndChangeRequest`. Specs en `tickets-frontend/docs/` (Actualización 28).

### Pendientes (en orden)
1. Waiting Room (módulo completo — la base ya está en RedisService)
2. Refunds (con lógica de retención de fee según motivo)
3. Reporting (dashboard organizadores: ventas, asistencia, export CSV)
4. Testing (unit + e2e del flujo de compra)
5. Admin Panel (conciliación, override de estados)

## Variables de entorno del proyecto

Ver `.env.example`. Las agregadas durante este desarrollo:
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `APP_URL`
- `STORAGE_PATH` (default `./storage`), `QR_SECRET` (mínimo 32 chars)
- `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER`, `SMTP_PASSWORD` (contraseña de aplicación de Gmail), `SMTP_FROM_NAME`, `SMTP_FROM_EMAIL`

## Cosas a tener en cuenta al desarrollar

- Siempre correr el build al final de cada bloque de cambios y corregir errores de TypeScript antes de dar por terminado
- Verificar dependencias circulares entre módulos (usar `forwardRef()` solo si es inevitable)
- Los webhooks de MP pueden llegar duplicados o fuera de orden — toda lógica de pago debe ser idempotente
- Los datos de seed con UUIDs deben usar solo caracteres hexadecimales válidos (0-9, a-f) — un UUID con `t` o `g` falla la validación `@IsUUID()`
- Gmail SMTP tiene límite de ~500 emails/día — suficiente para MVP, migrar a proveedor transaccional en producción