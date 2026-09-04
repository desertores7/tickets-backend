import { MigrationInterface, QueryRunner, TableForeignKey, TableIndex } from 'typeorm';

/**
 * Auditoria de performance previa a produccion: indices y FKs faltantes sobre
 * los caminos de lectura reales (listados, filtros, busquedas y reporting).
 *
 * Criterio: solo se agregan indices que respaldan una consulta que hoy existe
 * en el codigo. No se agrega nada "por las dudas" — cada indice cuesta en
 * escritura y en el buffer pool.
 *
 * Nota MySQL/InnoDB: toda columna con FOREIGN KEY ya tiene indice automatico,
 * asi que aca no se repiten indices de una sola columna FK.
 */
export class PerformanceIndexes1785900000000 implements MigrationInterface {
  name = 'PerformanceIndexes1785900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── event ────────────────────────────────────────────────────────────────
    // Listado publico: isActive + isPublished + endDate >= NOW() ORDER BY startDate.
    // Hoy solo hay IDX_event_startDate, que no filtra nada de lo anterior: con
    // el catalogo creciendo la query pasa a leer casi toda la tabla.
    await queryRunner.createIndex(
      'event',
      new TableIndex({
        name: 'IDX_event_public_listing',
        columnNames: ['isPublished', 'isActive', 'endDate', 'startDate']
      })
    );

    // Backoffice del productor: eventos de sus organizaciones ordenados por fecha.
    await queryRunner.createIndex(
      'event',
      new TableIndex({
        name: 'IDX_event_org_startDate',
        columnNames: ['organizationUuid', 'startDate']
      })
    );

    // ── orders ───────────────────────────────────────────────────────────────
    // Reporting de ventas y dashboard: o.eventUuid IN (...) AND o.status IN (...)
    // AND o.createdAt BETWEEN ... ORDER BY o.createdAt DESC.
    // Los indices sueltos de eventUuid y status no cubren el rango ni el orden.
    await queryRunner.createIndex(
      'orders',
      new TableIndex({
        name: 'IDX_orders_event_status_createdAt',
        columnNames: ['eventUuid', 'status', 'createdAt']
      })
    );

    // "Mis ordenes": userUuid [+ status] ORDER BY createdAt DESC.
    await queryRunner.createIndex(
      'orders',
      new TableIndex({
        name: 'IDX_orders_user_status_createdAt',
        columnNames: ['userUuid', 'status', 'createdAt']
      })
    );

    // couponUuid se agrego en CreateCoupon sin indice ni FK: hoy nada impide
    // que una orden apunte a un cupon inexistente, y el conteo de usos por
    // cupon hace full scan de orders.
    await queryRunner.createIndex(
      'orders',
      new TableIndex({ name: 'IDX_orders_couponUuid', columnNames: ['couponUuid'] })
    );

    await queryRunner.createForeignKey(
      'orders',
      new TableForeignKey({
        name: 'FK_orders_coupon',
        columnNames: ['couponUuid'],
        referencedTableName: 'coupon',
        referencedColumnNames: ['uuid'],
        onDelete: 'SET NULL',
        onUpdate: 'NO ACTION'
      })
    );

    // ── ticket ───────────────────────────────────────────────────────────────
    // Puerta y contador en vivo: t.eventUuid = ? AND t.status IN (...).
    // Reemplaza a IDX_ticket_eventUuid (queda redundante por prefijo).
    await queryRunner.createIndex(
      'ticket',
      new TableIndex({ name: 'IDX_ticket_event_status', columnNames: ['eventUuid', 'status'] })
    );
    await queryRunner.dropIndex('ticket', 'IDX_ticket_eventUuid');

    // "Mis tickets": userUuid ordenado por fecha.
    await queryRunner.createIndex(
      'ticket',
      new TableIndex({ name: 'IDX_ticket_user_createdAt', columnNames: ['userUuid', 'createdAt'] })
    );
    await queryRunner.dropIndex('ticket', 'IDX_ticket_userUuid');

    // ── user ─────────────────────────────────────────────────────────────────
    // Busqueda por documento en el acceso al evento (check-in/find-by-document):
    // hoy es un full scan de la tabla de usuarios en el peor momento posible.
    await queryRunner.createIndex(
      'user',
      new TableIndex({ name: 'IDX_user_dni', columnNames: ['dni'] })
    );

    // ── coupon_redemption ────────────────────────────────────────────────────
    // Falta la FK a orders: una redencion puede quedar apuntando a una orden
    // borrada. El indice unico UQ_coupon_redemption_order ya existe.
    await queryRunner.createForeignKey(
      'coupon_redemption',
      new TableForeignKey({
        name: 'FK_coupon_redemption_order',
        columnNames: ['orderUuid'],
        referencedTableName: 'orders',
        referencedColumnNames: ['uuid'],
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION'
      })
    );

    // ── user_notification ────────────────────────────────────────────────────
    // Badge de no leidas: userUuid + readAt IS NULL. El indice existente
    // (userUuid, createdAt) sirve al listado pero no al conteo.
    await queryRunner.createIndex(
      'user_notification',
      new TableIndex({ name: 'IDX_user_notification_user_read', columnNames: ['userUuid', 'readAt'] })
    );

    // ── check_in_log ─────────────────────────────────────────────────────────
    // Auditoria por evento en orden cronologico. Los indices sueltos de
    // eventUuid y scannedAt obligan a ordenar en memoria.
    await queryRunner.createIndex(
      'check_in_log',
      new TableIndex({ name: 'IDX_check_in_log_event_scannedAt', columnNames: ['eventUuid', 'scannedAt'] })
    );

    // ── event_media ──────────────────────────────────────────────────────────
    // Portada del listado: eventUuid + isDeleted IS NULL ORDER BY sortOrder.
    await queryRunner.createIndex(
      'event_media',
      new TableIndex({
        name: 'IDX_event_media_event_sort',
        columnNames: ['eventUuid', 'isDeleted', 'sortOrder']
      })
    );

    // ── ticket_type ──────────────────────────────────────────────────────────
    // Tandas activas de un evento en orden de visualizacion.
    await queryRunner.createIndex(
      'ticket_type',
      new TableIndex({
        name: 'IDX_ticket_type_event_active_sort',
        columnNames: ['eventUuid', 'isActive', 'sortOrder']
      })
    );

    // ── mp_movement / event_income ──────────────────────────────────────────
    // Los listados de caja filtran ademas por isDeleted IS NULL.
    await queryRunner.createIndex(
      'event_income',
      new TableIndex({
        name: 'IDX_event_income_event_deleted_occurred',
        columnNames: ['eventUuid', 'isDeleted', 'occurredAt']
      })
    );
    await queryRunner.createIndex(
      'mp_movement',
      new TableIndex({
        name: 'IDX_mp_movement_event_deleted_occurred',
        columnNames: ['eventUuid', 'isDeleted', 'occurredAt']
      })
    );

    // ── payout ───────────────────────────────────────────────────────────────
    // El listado filtra isDeleted IS NULL antes de ordenar por transferredAt.
    await queryRunner.createIndex(
      'payout',
      new TableIndex({
        name: 'IDX_payout_org_deleted_transferred',
        columnNames: ['organizationUuid', 'isDeleted', 'transferredAt']
      })
    );
    await queryRunner.dropIndex('payout', 'IDX_payout_org_transferred');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createIndex(
      'payout',
      new TableIndex({ name: 'IDX_payout_org_transferred', columnNames: ['organizationUuid', 'transferredAt'] })
    );
    await queryRunner.dropIndex('payout', 'IDX_payout_org_deleted_transferred');

    await queryRunner.dropIndex('mp_movement', 'IDX_mp_movement_event_deleted_occurred');
    await queryRunner.dropIndex('event_income', 'IDX_event_income_event_deleted_occurred');
    await queryRunner.dropIndex('ticket_type', 'IDX_ticket_type_event_active_sort');
    await queryRunner.dropIndex('event_media', 'IDX_event_media_event_sort');
    await queryRunner.dropIndex('check_in_log', 'IDX_check_in_log_event_scannedAt');
    await queryRunner.dropIndex('user_notification', 'IDX_user_notification_user_read');

    await queryRunner.dropForeignKey('coupon_redemption', 'FK_coupon_redemption_order');
    await queryRunner.dropIndex('user', 'IDX_user_dni');

    await queryRunner.createIndex(
      'ticket',
      new TableIndex({ name: 'IDX_ticket_userUuid', columnNames: ['userUuid'] })
    );
    await queryRunner.dropIndex('ticket', 'IDX_ticket_user_createdAt');
    await queryRunner.createIndex(
      'ticket',
      new TableIndex({ name: 'IDX_ticket_eventUuid', columnNames: ['eventUuid'] })
    );
    await queryRunner.dropIndex('ticket', 'IDX_ticket_event_status');

    await queryRunner.dropForeignKey('orders', 'FK_orders_coupon');
    await queryRunner.dropIndex('orders', 'IDX_orders_couponUuid');
    await queryRunner.dropIndex('orders', 'IDX_orders_user_status_createdAt');
    await queryRunner.dropIndex('orders', 'IDX_orders_event_status_createdAt');

    await queryRunner.dropIndex('event', 'IDX_event_org_startDate');
    await queryRunner.dropIndex('event', 'IDX_event_public_listing');
  }
}
