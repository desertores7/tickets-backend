import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

/** Alertas de stock por tanda (FP05 §14 / BR-EVENT-017). */
export class CreateStockAlert1785000000000 implements MigrationInterface {
  name = 'CreateStockAlert1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'stock_alert',
        columns: [
          { name: 'uuid', type: 'varchar', length: '36', isPrimary: true },
          { name: 'eventUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'ticketTypeUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'lowThreshold', type: 'int', isNullable: true, default: null },
          { name: 'thresholdIsPercent', type: 'boolean', isNullable: false, default: false },
          { name: 'notifySoldOut', type: 'boolean', isNullable: false, default: true },
          { name: 'active', type: 'boolean', isNullable: false, default: true },
          { name: 'lowNotifiedAt', type: 'timestamp', precision: 3, isNullable: true, default: null },
          { name: 'soldOutNotifiedAt', type: 'timestamp', precision: 3, isNullable: true, default: null },
          { name: 'isDeleted', type: 'boolean', isNullable: true, default: null },
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
      'stock_alert',
      new TableForeignKey({
        name: 'FK_stock_alert_event',
        columnNames: ['eventUuid'],
        referencedTableName: 'event',
        referencedColumnNames: ['uuid'],
        onDelete: 'CASCADE'
      })
    );

    await queryRunner.createForeignKey(
      'stock_alert',
      new TableForeignKey({
        name: 'FK_stock_alert_ticket_type',
        columnNames: ['ticketTypeUuid'],
        referencedTableName: 'ticket_type',
        referencedColumnNames: ['uuid'],
        onDelete: 'CASCADE'
      })
    );

    // Una alerta por tanda: dos configuraciones para la misma tanda solo
    // duplicarian los avisos.
    await queryRunner.createIndex(
      'stock_alert',
      new TableIndex({
        name: 'UQ_stock_alert_ticket_type',
        columnNames: ['ticketTypeUuid'],
        isUnique: true
      })
    );

    // La evaluacion tras cada compra consulta por tanda; el indice por evento
    // sirve a la pantalla de configuracion.
    await queryRunner.createIndex(
      'stock_alert',
      new TableIndex({ name: 'IDX_stock_alert_event', columnNames: ['eventUuid'] })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('stock_alert', true);
  }
}
