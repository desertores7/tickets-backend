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

export class CreateEventAndTicketType1781740800000 implements MigrationInterface {
  name = 'CreateEventAndTicketType1781740800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'event',
        columns: [
          uuidPrimaryColumn,
          { name: 'name', type: 'varchar', length: '255', isNullable: false },
          { name: 'description', type: 'text', isNullable: true, default: null },
          { name: 'slug', type: 'varchar', length: '255', isNullable: false, isUnique: true },
          { name: 'bannerUrl', type: 'varchar', length: '500', isNullable: true, default: null },
          { name: 'startDate', type: 'timestamp', isNullable: false },
          { name: 'endDate', type: 'timestamp', isNullable: false },
          { name: 'saleStartDate', type: 'timestamp', isNullable: true, default: null },
          { name: 'saleEndDate', type: 'timestamp', isNullable: true, default: null },
          { name: 'isPublished', type: 'tinyint', width: 1, isNullable: false, default: 0 },
          { name: 'isActive', type: 'tinyint', width: 1, isNullable: false, default: 1 },
          { name: 'organizationUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'venueName', type: 'varchar', length: '255', isNullable: false },
          { name: 'venueAddress', type: 'varchar', length: '500', isNullable: false },
          { name: 'venueCity', type: 'varchar', length: '100', isNullable: false },
          { name: 'venueCountry', type: 'varchar', length: '100', isNullable: false },
          { name: 'maxCapacity', type: 'int', isNullable: false },
          ...timestampColumns
        ],
        indices: [
          new TableIndex({ name: 'IDX_event_slug', columnNames: ['slug'], isUnique: true }),
          new TableIndex({ name: 'IDX_event_organizationUuid', columnNames: ['organizationUuid'] }),
          new TableIndex({ name: 'IDX_event_startDate', columnNames: ['startDate'] })
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['organizationUuid'],
            referencedTableName: 'organization',
            referencedColumnNames: ['uuid'],
            onDelete: 'NO ACTION',
            onUpdate: 'NO ACTION'
          })
        ]
      }),
      true
    );

    await queryRunner.createTable(
      new Table({
        name: 'ticket_type',
        columns: [
          uuidPrimaryColumn,
          { name: 'eventUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'name', type: 'varchar', length: '255', isNullable: false },
          { name: 'description', type: 'text', isNullable: true, default: null },
          { name: 'price', type: 'decimal', precision: 10, scale: 2, isNullable: false },
          { name: 'currency', type: 'varchar', length: '3', isNullable: false, default: "'ARS'" },
          { name: 'quantity', type: 'int', isNullable: false },
          { name: 'availableQuantity', type: 'int', isNullable: false },
          { name: 'minPerOrder', type: 'int', isNullable: false, default: 1 },
          { name: 'maxPerOrder', type: 'int', isNullable: false, default: 10 },
          { name: 'saleStartDate', type: 'timestamp', isNullable: true, default: null },
          { name: 'saleEndDate', type: 'timestamp', isNullable: true, default: null },
          { name: 'isActive', type: 'tinyint', width: 1, isNullable: false, default: 1 },
          { name: 'sortOrder', type: 'int', isNullable: false, default: 0 },
          ...timestampColumns
        ],
        indices: [new TableIndex({ name: 'IDX_ticket_type_eventUuid', columnNames: ['eventUuid'] })],
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
    await queryRunner.dropTable('ticket_type', true);
    await queryRunner.dropTable('event', true);
  }
}
