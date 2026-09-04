import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex
} from 'typeorm';

/**
 * Solicitudes de reembolso (`BR-REFUND-001` a `011`).
 *
 * Decisiones que explican la forma de estas tablas:
 *
 * - **La unidad es el ticket, no la orden** (`BR-REFUND-009`). Por eso hay una
 *   tabla hija: una solicitud puede llevar 2 de 5 entradas, y más tarde otra
 *   solicitud puede llevar las 3 restantes.
 * - **Un ticket se reembolsa una sola vez.** Lo garantiza `ticket.status`, que
 *   suma el valor `refunded`: reservarlo con un UPDATE condicional sobre
 *   `status = 'active'` cierra la carrera de dos pedidos simultáneos mejor que
 *   cualquier chequeo en el servicio.
 * - **El estado separa nuestra decisión del resultado del pago**
 *   (`BR-REFUND-004`): `approved` es "la validamos", `refunded` es "la plata
 *   volvió". Sin esa separación, una solicitud aprobada que MP no pagó queda
 *   indistinguible de una pagada.
 * - `uniqueSequenceNumber` es el número con el que se le reclama a Mercado
 *   Pago cuando el comprador dice que no le llegó.
 */
export class CreateRefundRequest1786100000000 implements MigrationInterface {
  name = 'CreateRefundRequest1786100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Un ticket reembolsado no es lo mismo que uno cancelado por otro motivo.
    await queryRunner.query(
      "ALTER TABLE `ticket` MODIFY `status` " +
        "ENUM('active', 'used', 'cancelled', 'transferred', 'refunded') " +
        "NOT NULL DEFAULT 'active'"
    );

    await queryRunner.createTable(
      new Table({
        name: 'refund_request',
        columns: [
          { name: 'uuid', type: 'varchar', length: '36', isPrimary: true },
          { name: 'orderUuid', type: 'varchar', length: '36', isNullable: false },
          // Denormalizado: la vista del productor (`29` §7) filtra por evento.
          { name: 'eventUuid', type: 'varchar', length: '36', isNullable: false },
          // Quien pide. Tiene que ser el comprador original (`BR-REFUND-001`).
          { name: 'userUuid', type: 'varchar', length: '36', isNullable: false },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'approved', 'processing', 'refunded', 'rejected', 'failed'],
            default: "'pending'",
            isNullable: false
          },
          // Suma de las entradas incluidas, SIN costo de servicio (`BR-REFUND-006`).
          { name: 'amount', type: 'decimal', precision: 14, scale: 2, isNullable: false },
          { name: 'currency', type: 'varchar', length: '3', default: "'ARS'", isNullable: false },
          // Pago de MP sobre el que se ejecuta el reintegro.
          { name: 'mpPaymentId', type: 'varchar', length: '64', isNullable: false },
          { name: 'mpRefundId', type: 'varchar', length: '64', isNullable: true, default: null },
          {
            name: 'amountRefundedToPayer',
            type: 'decimal',
            precision: 14,
            scale: 2,
            isNullable: true,
            default: null
          },
          {
            name: 'uniqueSequenceNumber',
            type: 'varchar',
            length: '64',
            isNullable: true,
            default: null
          },
          // Motivo del rechazo o del fallo, para el email y para el Admin.
          { name: 'resolutionReason', type: 'varchar', length: '500', isNullable: true, default: null },
          { name: 'requestedAt', type: 'timestamp', precision: 3, default: 'CURRENT_TIMESTAMP(3)' },
          { name: 'resolvedAt', type: 'timestamp', precision: 3, isNullable: true, default: null },
          // Cuántas veces se intentó el refund. Solo lo sube una acción manual:
          // el cron nunca reintenta (`BR-REFUND-011`).
          { name: 'attempts', type: 'int', isNullable: false, default: 0 },
          { name: 'createdAt', type: 'timestamp', precision: 3, default: 'CURRENT_TIMESTAMP(3)' },
          {
            name: 'updatedAt',
            type: 'timestamp',
            precision: 3,
            default: 'CURRENT_TIMESTAMP(3)',
            onUpdate: 'CURRENT_TIMESTAMP(3)'
          }
        ]
      }),
      true
    );

    await queryRunner.createTable(
      new Table({
        name: 'refund_request_ticket',
        columns: [
          { name: 'uuid', type: 'varchar', length: '36', isPrimary: true },
          { name: 'refundRequestUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'ticketUuid', type: 'varchar', length: '36', isNullable: false },
          // Valor de esa entrada al momento de la compra, sin fee.
          { name: 'amount', type: 'decimal', precision: 14, scale: 2, isNullable: false },
          { name: 'createdAt', type: 'timestamp', precision: 3, default: 'CURRENT_TIMESTAMP(3)' }
        ]
      }),
      true
    );

    for (const [table, column, ref, onDelete] of [
      ['refund_request', 'orderUuid', 'orders', 'CASCADE'],
      ['refund_request', 'eventUuid', 'event', 'CASCADE'],
      ['refund_request', 'userUuid', 'user', 'RESTRICT'],
      ['refund_request_ticket', 'refundRequestUuid', 'refund_request', 'CASCADE'],
      ['refund_request_ticket', 'ticketUuid', 'ticket', 'CASCADE']
    ] as const) {
      await queryRunner.createForeignKey(
        table,
        new TableForeignKey({
          name: `FK_${table}_${column}`,
          columnNames: [column],
          referencedTableName: ref,
          referencedColumnNames: ['uuid'],
          onDelete
        })
      );
    }

    // El mismo ticket no puede repetirse dentro de una solicitud.
    await queryRunner.createIndex(
      'refund_request_ticket',
      new TableIndex({
        name: 'UQ_refund_request_ticket',
        columnNames: ['refundRequestUuid', 'ticketUuid'],
        isUnique: true
      })
    );

    // El cron levanta las pendientes más viejas primero.
    await queryRunner.createIndex(
      'refund_request',
      new TableIndex({ name: 'IDX_refund_request_cola', columnNames: ['status', 'requestedAt'] })
    );

    // La vista del productor filtra por evento y estado.
    await queryRunner.createIndex(
      'refund_request',
      new TableIndex({ name: 'IDX_refund_request_event', columnNames: ['eventUuid', 'status'] })
    );

    // "Mis reembolsos" del comprador.
    await queryRunner.createIndex(
      'refund_request',
      new TableIndex({ name: 'IDX_refund_request_user', columnNames: ['userUuid', 'requestedAt'] })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('refund_request_ticket', true);
    await queryRunner.dropTable('refund_request', true);

    await queryRunner.query("UPDATE `ticket` SET `status` = 'cancelled' WHERE `status` = 'refunded'");
    await queryRunner.query(
      "ALTER TABLE `ticket` MODIFY `status` " +
        "ENUM('active', 'used', 'cancelled', 'transferred') NOT NULL DEFAULT 'active'"
    );
  }
}
