import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

const uuidPrimaryColumn = {
  name: 'uuid',
  type: 'varchar',
  length: '36',
  isPrimary: true
} as const;

const timestampColumns = [
  {
    name: 'createdAt',
    type: 'timestamp',
    precision: 3,
    isNullable: true,
    default: 'CURRENT_TIMESTAMP(3)'
  },
  {
    name: 'updatedAt',
    type: 'timestamp',
    precision: 3,
    isNullable: true,
    default: 'CURRENT_TIMESTAMP(3)',
    onUpdate: 'CURRENT_TIMESTAMP(3)'
  }
] as const;

export class CreateEventFeeSummary1782172800000 implements MigrationInterface {
  name = 'CreateEventFeeSummary1782172800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'event_fee_summary',
        columns: [
          uuidPrimaryColumn,
          { name: 'eventUuid', type: 'varchar', length: '36', isNullable: false, isUnique: true },
          { name: 'totalOrdersPaid', type: 'int', isNullable: false, default: 0 },
          { name: 'totalTicketsSold', type: 'int', isNullable: false, default: 0 },
          { name: 'grossAmount', type: 'decimal', precision: 12, scale: 2, isNullable: false, default: 0 },
          { name: 'ticketAmount', type: 'decimal', precision: 12, scale: 2, isNullable: false, default: 0 },
          { name: 'serviceFeeAmount', type: 'decimal', precision: 12, scale: 2, isNullable: false, default: 0 },
          { name: 'currency', type: 'varchar', length: '3', isNullable: false, default: "'ARS'" },
          { name: 'lastOrderPaidAt', type: 'timestamp', isNullable: true, default: null },
          ...timestampColumns
        ],
        indices: [
          new TableIndex({
            name: 'IDX_event_fee_summary_eventUuid',
            columnNames: ['eventUuid'],
            isUnique: true
          })
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['eventUuid'],
            referencedTableName: 'event',
            referencedColumnNames: ['uuid'],
            onDelete: 'NO ACTION',
            onUpdate: 'NO ACTION'
          })
        ]
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('event_fee_summary', true);
  }
}
