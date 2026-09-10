import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Unifica en UTC las fechas que escribía el código en hora argentina.
 *
 * **El problema.** El servidor MySQL corre en UTC, así que todo lo que escribe
 * la base (`CURRENT_TIMESTAMP` en `createdAt` / `updatedAt`) quedó en UTC. El
 * driver, en cambio, venía con `timezone: 'local'` y el contenedor en `-03`:
 * las fechas que escribe el código quedaron guardadas en hora argentina. Dos
 * convenciones conviviendo en la misma base.
 *
 * Al leer, el driver interpretaba todo como `-03`. Las del código cerraban de
 * casualidad —el error de ida y el de vuelta se cancelaban— y las de la base
 * salían **3 horas adelantadas**: el detalle de una compra mostraba las 19:24
 * cuando el comprobante de Mercado Pago decía 16:24.
 *
 * **El arreglo.** El driver pasa a `timezone: 'Z'` (ver `data-source.ts`), con
 * lo que las 84 columnas de auditoría quedan correctas sin tocar un dato. Esta
 * migración corrige la otra mitad: corre `+3h` las 40 columnas que escribió el
 * código, para pasarlas de hora argentina a UTC.
 *
 * **Por qué 3 horas fijas.** Argentina no aplica horario de verano desde 2009,
 * así que el desfase es constante para todo el histórico.
 *
 * **No es idempotente, y no puede serlo**: mirando un `timestamp` no hay forma
 * de saber en qué convención se guardó. Correrla dos veces corre los datos dos
 * veces. Lo que lo evita es el registro de la tabla `migrations`.
 *
 * **Se corre con la API detenida.** Entre esta migración y el arranque del
 * código nuevo, cualquier fila que escriba la versión vieja queda en `-03` y no
 * la alcanza el corrimiento.
 */
export class NormalizeTimestampsToUtc1786400000000 implements MigrationInterface {
  name = 'NormalizeTimestampsToUtc1786400000000';

  /** Desfase de Argentina contra UTC. Constante desde 2009. */
  private static readonly OFFSET_HOURS = 3;

  /**
   * Columnas escritas por el código, en hora argentina.
   *
   * No están las `createdAt` / `updatedAt`: esas las escribe la base y ya
   * estaban en UTC. Meterlas acá las rompería.
   */
  private static readonly COLUMNS: Array<[string, string[]]> = [
    ['check_in_log', ['scannedAt']],
    ['coupon', ['validFrom', 'validUntil']],
    [
      'event',
      [
        'cancelledAt',
        'endDate',
        'publishedAt',
        'refundWindowExtendedTo',
        'saleEndDate',
        'saleStartDate',
        'salesClosedAt',
        'startDate'
      ]
    ],
    ['event_change', ['notifiedAt', 'refundWindowEndsAt']],
    ['event_fee_summary', ['lastOrderPaidAt']],
    ['event_income', ['occurredAt']],
    ['mp_catalog_item', ['lastSyncAt']],
    ['mp_movement', ['occurredAt']],
    ['orders', ['expiresAt', 'paidAt']],
    ['org_mp_account', ['lastCatalogSyncAt', 'tokenExpiresAt']],
    ['organization', ['validationResolvedAt', 'validationSubmittedAt']],
    ['organization_producer_invite', ['acceptedAt', 'expiresAt']],
    ['organization_request', ['resolvedAt']],
    ['payout', ['transferredAt']],
    ['refund_request', ['requestedAt', 'resolvedAt']],
    ['stock_alert', ['lowNotifiedAt', 'soldOutNotifiedAt']],
    ['support_request', ['resolvedAt']],
    ['ticket', ['checkedInAt']],
    ['ticket_type', ['saleEndDate', 'saleStartDate']],
    ['user', ['emailVerifiedAt', 'termsAcceptedAt']],
    ['user_notification', ['readAt']],
    ['user_password_reset', ['expiresAt']],
    ['user_session', ['expiresAt']]
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.shift(queryRunner, 'DATE_ADD');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.shift(queryRunner, 'DATE_SUB');
  }

  private async shift(queryRunner: QueryRunner, fn: 'DATE_ADD' | 'DATE_SUB'): Promise<void> {
    const hours = NormalizeTimestampsToUtc1786400000000.OFFSET_HOURS;

    for (const [table, columns] of NormalizeTimestampsToUtc1786400000000.COLUMNS) {
      // Una sentencia por tabla: mueve todas sus columnas de una pasada.
      const sets = columns
        .map(column => '`' + column + '` = ' + fn + '(`' + column + '`, INTERVAL ' + hours + ' HOUR)')
        .join(', ');

      // Los nulos quedan intactos por sí solos (`DATE_ADD(NULL, …)` es NULL);
      // el WHERE está para no reescribir filas que no tienen ninguna fecha.
      const where = columns.map(column => '`' + column + '` IS NOT NULL').join(' OR ');

      await queryRunner.query('UPDATE `' + table + '` SET ' + sets + ' WHERE ' + where);
    }
  }
}
