import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex
} from 'typeorm';

/**
 * Cambios materiales y operación post-publicación (FP10 / `29` §19).
 *
 * Tres cosas a la vez, porque no tienen sentido por separado:
 *
 * 1. `event.lineup` — lineup **estructurado** (`BR-EVENT-016`), distinto de la
 *    descripción libre. Sin este campo no hay nada que comparar: cambiar el
 *    lineup es material y editar la descripción no.
 * 2. Estado operativo del evento: `cancelledAt` + motivo y `salesClosedAt`
 *    (corte manual de venta, `BR-EVENT-013`).
 * 3. `event_change` — auditoría de qué cambió, quién y cuándo, con la ventana
 *    de reembolso que abre cada cambio material (`BR-REFUND-010`). Es también
 *    el registro de cambios de stock que pide `BR-EVENT-005`.
 */
export class CreateEventChange1785600000000 implements MigrationInterface {
  name = 'CreateEventChange1785600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('event', [
      new TableColumn({
        name: 'lineup',
        type: 'json',
        isNullable: true,
        default: null
      }),
      new TableColumn({
        name: 'cancelledAt',
        type: 'timestamp',
        precision: 3,
        isNullable: true,
        default: null
      }),
      new TableColumn({
        name: 'cancellationReason',
        type: 'varchar',
        length: '500',
        isNullable: true,
        default: null
      }),
      new TableColumn({
        name: 'salesClosedAt',
        type: 'timestamp',
        precision: 3,
        isNullable: true,
        default: null
      })
    ]);

    await queryRunner.createTable(
      new Table({
        name: 'event_change',
        columns: [
          { name: 'uuid', type: 'varchar', length: '36', isPrimary: true },
          { name: 'eventUuid', type: 'varchar', length: '36', isNullable: false },
          {
            name: 'type',
            type: 'enum',
            enum: ['reschedule', 'venue', 'lineup', 'cancellation', 'sales_close', 'stock', 'info'],
            isNullable: false
          },
          { name: 'isMaterial', type: 'boolean', isNullable: false, default: false },
          // [{ field, label, before, after }] — el resumen que se le muestra al
          // comprador y al productor, congelado al momento del cambio.
          { name: 'changes', type: 'json', isNullable: true, default: null },
          { name: 'reason', type: 'varchar', length: '500', isNullable: true, default: null },
          // Solo para `stock`: qué tanda se tocó.
          { name: 'ticketTypeUuid', type: 'varchar', length: '36', isNullable: true, default: null },
          {
            name: 'refundWindowEndsAt',
            type: 'timestamp',
            precision: 3,
            isNullable: true,
            default: null
          },
          { name: 'notifiedAt', type: 'timestamp', precision: 3, isNullable: true, default: null },
          { name: 'buyersNotified', type: 'int', isNullable: false, default: 0 },
          { name: 'createdBy', type: 'varchar', length: '36', isNullable: true, default: null },
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

    await queryRunner.createForeignKey(
      'event_change',
      new TableForeignKey({
        name: 'FK_event_change_event',
        columnNames: ['eventUuid'],
        referencedTableName: 'event',
        referencedColumnNames: ['uuid'],
        onDelete: 'CASCADE'
      })
    );

    // La tanda se puede borrar sin perder el registro de que su stock cambió.
    await queryRunner.createForeignKey(
      'event_change',
      new TableForeignKey({
        name: 'FK_event_change_ticket_type',
        columnNames: ['ticketTypeUuid'],
        referencedTableName: 'ticket_type',
        referencedColumnNames: ['uuid'],
        onDelete: 'SET NULL'
      })
    );

    // El historial se lista por evento y del más nuevo al más viejo.
    await queryRunner.createIndex(
      'event_change',
      new TableIndex({
        name: 'IDX_event_change_event',
        columnNames: ['eventUuid', 'createdAt']
      })
    );

    // La consulta caliente es "¿este evento tiene una ventana abierta?".
    await queryRunner.createIndex(
      'event_change',
      new TableIndex({
        name: 'IDX_event_change_window',
        columnNames: ['eventUuid', 'isMaterial', 'refundWindowEndsAt']
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('event_change', true);
    await queryRunner.dropColumns('event', [
      'lineup',
      'cancelledAt',
      'cancellationReason',
      'salesClosedAt'
    ]);
  }
}
