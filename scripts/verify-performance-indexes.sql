-- Verificacion de la migracion PerformanceIndexes1785900000000
-- Uso: mysql -u admin -p tickets_db < scripts/verify-performance-indexes.sql

-- 1) La migracion quedo registrada
SELECT 'migracion registrada' AS check_name, COUNT(*) AS ok
FROM migrations WHERE name = 'PerformanceIndexes1785900000000';
-- esperado: ok = 1

-- 2) Los 14 indices nuevos existen
SELECT 'indices nuevos' AS check_name, COUNT(DISTINCT INDEX_NAME) AS encontrados
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME IN (
  'IDX_event_public_listing',
  'IDX_event_org_startDate',
  'IDX_orders_event_status_createdAt',
  'IDX_orders_user_status_createdAt',
  'IDX_orders_couponUuid',
  'IDX_ticket_event_status',
  'IDX_ticket_user_createdAt',
  'IDX_user_dni',
  'IDX_user_notification_user_read',
  'IDX_check_in_log_event_scannedAt',
  'IDX_event_media_event_sort',
  'IDX_ticket_type_event_active_sort',
  'IDX_event_income_event_deleted_occurred',
  'IDX_mp_movement_event_deleted_occurred',
  'IDX_payout_org_deleted_transferred'
);
-- esperado: encontrados = 15

-- 3) Los indices redundantes se borraron
SELECT 'indices viejos borrados' AS check_name, COUNT(DISTINCT INDEX_NAME) AS quedan
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND INDEX_NAME IN ('IDX_ticket_eventUuid', 'IDX_ticket_userUuid', 'IDX_payout_org_transferred');
-- esperado: quedan = 0

-- 4) Las 2 FKs nuevas existen
SELECT 'fks nuevas' AS check_name, COUNT(*) AS encontradas
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  AND CONSTRAINT_NAME IN ('FK_orders_coupon', 'FK_coupon_redemption_order');
-- esperado: encontradas = 2

-- 5) Detalle completo de los indices de las tablas tocadas
SELECT TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX, COLUMN_NAME, NON_UNIQUE
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('event','orders','ticket','ticket_type','user','user_notification',
                     'check_in_log','event_media','event_income','mp_movement','payout')
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;

-- 6) EXPLAIN de las 5 queries criticas: verificar que 'key' NO sea NULL
--    y que 'Extra' no diga "Using filesort" en las de listado.

EXPLAIN SELECT uuid, name, startDate FROM event
WHERE isActive = 1 AND isPublished = 1 AND endDate >= NOW()
ORDER BY startDate ASC LIMIT 20;
-- esperado: key = IDX_event_public_listing

EXPLAIN SELECT o.uuid, o.createdAt, oi.quantity FROM order_item oi
INNER JOIN orders o ON o.uuid = oi.orderUuid
WHERE o.status IN ('paid','refunded')
  AND o.eventUuid IN (SELECT uuid FROM event LIMIT 5)
ORDER BY o.createdAt DESC LIMIT 20;
-- esperado: sobre 'o' -> key = IDX_orders_event_status_createdAt

EXPLAIN SELECT uuid FROM user WHERE dni = '30123456';
-- esperado: key = IDX_user_dni

EXPLAIN SELECT uuid FROM ticket
WHERE eventUuid = (SELECT uuid FROM event LIMIT 1) AND status IN ('active','used');
-- esperado: key = IDX_ticket_event_status

EXPLAIN SELECT COUNT(*) FROM user_notification
WHERE userUuid = (SELECT uuid FROM user LIMIT 1) AND readAt IS NULL;
-- esperado: key = IDX_user_notification_user_read

-- ── UserEmailUnique1785920000000 ─────────────────────────────────────────────
SELECT 'unique en user.email' AS check_name,
       SUM(INDEX_NAME = 'UQ_user_email' AND NON_UNIQUE = 0) AS unico_ok,
       SUM(INDEX_NAME = 'IDX_user_email') AS viejo_pendiente
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user';
-- esperado: unico_ok = 1, viejo_pendiente = 0
-- (si viejo_pendiente = 1, el unique se creo igual: solo quedo un indice
--  redundante, se puede borrar con DROP INDEX `IDX_user_email` ON `user`)
