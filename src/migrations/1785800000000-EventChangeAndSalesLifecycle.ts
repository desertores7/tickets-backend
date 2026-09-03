import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

/**
 * FP10 / BR-EVENT-010 / BR-EVENT-013 / BR-REFUND-010:
 * - columnas de ciclo de vida en `event` (cancelación, cierre de venta, lineup)
 * - historial `event_change` con texto congelado + ventana de reembolso
 *
 * Idempotente: en algunos entornos de dev las columnas / `event_change` ya
 * existen (sync de entidad) aunque ninguna migración previa los haya creado.
 */
export class EventChangeAndSalesLifecycle1785800000000 implements MigrationInterface {
  name = 'EventChangeAndSalesLifecycle1785800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await addColumnIfMissing(
      queryRunner,
      'event',
      'lineup',
      '`lineup` json NULL DEFAULT NULL AFTER `googleMapsUrl`'
    );
    await addColumnIfMissing(
      queryRunner,
      'event',
      'cancelledAt',
      '`cancelledAt` timestamp(3) NULL DEFAULT NULL AFTER `publishedAt`'
    );
    await addColumnIfMissing(
      queryRunner,
      'event',
      'cancellationReason',
      '`cancellationReason` varchar(1000) NULL DEFAULT NULL AFTER `cancelledAt`'
    );
    await addColumnIfMissing(
      queryRunner,
      'event',
      'salesClosedAt',
      '`salesClosedAt` timestamp(3) NULL DEFAULT NULL AFTER `cancellationReason`'
    );

    if (!(await queryRunner.hasTable('event_change'))) {
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
            { name: 'reason', type: 'varchar', length: '1000', isNullable: true, default: null },
            {
              name: 'changes',
              type: 'json',
              isNullable: false,
              comment: '[{ field, label, before, after }] texto congelado'
            },
            { name: 'ticketTypeUuid', type: 'varchar', length: '36', isNullable: true, default: null },
            { name: 'refundWindowEndsAt', type: 'timestamp', precision: 3, isNullable: true, default: null },
            { name: 'notifiedAt', type: 'timestamp', precision: 3, isNullable: true, default: null },
            { name: 'buyersNotified', type: 'int', isNullable: false, default: 0 },
            { name: 'createdByUuid', type: 'varchar', length: '36', isNullable: true, default: null },
            { name: 'createdAt', type: 'timestamp', precision: 3, default: 'CURRENT_TIMESTAMP(3)' }
          ]
        })
      );
    }

    const eventChangeTable = await queryRunner.getTable('event_change');
    if (!eventChangeTable?.foreignKeys.some(fk => fk.name === 'FK_event_change_event')) {
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
    }

    if (!eventChangeTable?.indices.some(idx => idx.name === 'IDX_event_change_event_created')) {
      await queryRunner.createIndex(
        'event_change',
        new TableIndex({
          name: 'IDX_event_change_event_created',
          columnNames: ['eventUuid', 'createdAt']
        })
      );
    }

    if (!eventChangeTable?.indices.some(idx => idx.name === 'IDX_event_change_refund_window')) {
      await queryRunner.createIndex(
        'event_change',
        new TableIndex({
          name: 'IDX_event_change_refund_window',
          columnNames: ['refundWindowEndsAt']
        })
      );
    }

    // Eventos ya terminados: marcar cierre de venta para alinear estado con BR-EVENT-013.
    await queryRunner.query(`
      UPDATE \`event\`
      SET \`salesClosedAt\` = \`endDate\`
      WHERE \`salesClosedAt\` IS NULL
        AND \`cancelledAt\` IS NULL
        AND \`endDate\` <= NOW(3)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('event_change', true);
    await dropColumnIfExists(queryRunner, 'event', 'salesClosedAt');
    await dropColumnIfExists(queryRunner, 'event', 'cancellationReason');
    await dropColumnIfExists(queryRunner, 'event', 'cancelledAt');
    await dropColumnIfExists(queryRunner, 'event', 'lineup');
  }
}

async function addColumnIfMissing(
  queryRunner: QueryRunner,
  table: string,
  column: string,
  definition: string
): Promise<void> {
  if (await queryRunner.hasColumn(table, column)) return;
  await queryRunner.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
}

async function dropColumnIfExists(queryRunner: QueryRunner, table: string, column: string): Promise<void> {
  if (!(await queryRunner.hasColumn(table, column))) return;
  await queryRunner.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``);
}
