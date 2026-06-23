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

export class CreateOrderOrderItemAndTicket1781827200000 implements MigrationInterface {
  name = 'CreateOrderOrderItemAndTicket1781827200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'orders',
        columns: [
          uuidPrimaryColumn,
          { name: 'orderNumber', type: 'varchar', length: '50', isNullable: false, isUnique: true },
          { name: 'userUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'eventUuid', type: 'varchar', length: '36', isNullable: false },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending_payment', 'paid', 'cancelled', 'expired', 'refunded'],
            isNullable: false,
            default: "'pending_payment'"
          },
          { name: 'subtotal', type: 'decimal', precision: 10, scale: 2, isNullable: false },
          { name: 'serviceFee', type: 'decimal', precision: 10, scale: 2, isNullable: false },
          { name: 'total', type: 'decimal', precision: 10, scale: 2, isNullable: false },
          { name: 'currency', type: 'varchar', length: '3', isNullable: false, default: "'ARS'" },
          { name: 'paymentProvider', type: 'varchar', length: '50', isNullable: true, default: null },
          { name: 'paymentId', type: 'varchar', length: '255', isNullable: true, default: null },
          { name: 'paymentMethod', type: 'varchar', length: '100', isNullable: true, default: null },
          { name: 'paidAt', type: 'timestamp', isNullable: true, default: null },
          { name: 'expiresAt', type: 'timestamp', isNullable: false },
          { name: 'metadata', type: 'json', isNullable: true, default: null },
          ...timestampColumns
        ],
        indices: [
          new TableIndex({ name: 'IDX_orders_orderNumber', columnNames: ['orderNumber'], isUnique: true }),
          new TableIndex({ name: 'IDX_orders_userUuid', columnNames: ['userUuid'] }),
          new TableIndex({ name: 'IDX_orders_eventUuid', columnNames: ['eventUuid'] }),
          new TableIndex({ name: 'IDX_orders_status', columnNames: ['status'] }),
          new TableIndex({ name: 'IDX_orders_expiresAt', columnNames: ['expiresAt'] }),
          new TableIndex({ name: 'IDX_orders_status_expiresAt', columnNames: ['status', 'expiresAt'] })
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['userUuid'],
            referencedTableName: 'user',
            referencedColumnNames: ['uuid'],
            onDelete: 'NO ACTION',
            onUpdate: 'NO ACTION'
          }),
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

    await queryRunner.createTable(
      new Table({
        name: 'order_item',
        columns: [
          uuidPrimaryColumn,
          { name: 'orderUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'ticketTypeUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'quantity', type: 'int', isNullable: false },
          { name: 'unitPrice', type: 'decimal', precision: 10, scale: 2, isNullable: false },
          { name: 'subtotal', type: 'decimal', precision: 10, scale: 2, isNullable: false }
        ],
        indices: [
          new TableIndex({ name: 'IDX_order_item_orderUuid', columnNames: ['orderUuid'] }),
          new TableIndex({ name: 'IDX_order_item_ticketTypeUuid', columnNames: ['ticketTypeUuid'] })
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['orderUuid'],
            referencedTableName: 'orders',
            referencedColumnNames: ['uuid'],
            onDelete: 'CASCADE',
            onUpdate: 'NO ACTION'
          }),
          new TableForeignKey({
            columnNames: ['ticketTypeUuid'],
            referencedTableName: 'ticket_type',
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
        name: 'ticket',
        columns: [
          uuidPrimaryColumn,
          { name: 'orderItemUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'userUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'eventUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'ticketTypeUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'ticketNumber', type: 'varchar', length: '50', isNullable: false, isUnique: true },
          { name: 'qrCode', type: 'varchar', length: '500', isNullable: true, default: null, isUnique: true },
          { name: 'qrUrl', type: 'varchar', length: '500', isNullable: true, default: null },
          { name: 'pdfUrl', type: 'varchar', length: '500', isNullable: true, default: null },
          {
            name: 'status',
            type: 'enum',
            enum: ['active', 'used', 'cancelled', 'transferred'],
            isNullable: false,
            default: "'active'"
          },
          { name: 'checkedInAt', type: 'timestamp', isNullable: true, default: null },
          { name: 'checkedInBy', type: 'varchar', length: '36', isNullable: true, default: null },
          ...timestampColumns
        ],
        indices: [
          new TableIndex({ name: 'IDX_ticket_ticketNumber', columnNames: ['ticketNumber'], isUnique: true }),
          new TableIndex({ name: 'IDX_ticket_qrCode', columnNames: ['qrCode'], isUnique: true }),
          new TableIndex({ name: 'IDX_ticket_eventUuid', columnNames: ['eventUuid'] }),
          new TableIndex({ name: 'IDX_ticket_userUuid', columnNames: ['userUuid'] }),
          new TableIndex({ name: 'IDX_ticket_orderItemUuid', columnNames: ['orderItemUuid'] })
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['orderItemUuid'],
            referencedTableName: 'order_item',
            referencedColumnNames: ['uuid'],
            onDelete: 'NO ACTION',
            onUpdate: 'NO ACTION'
          }),
          new TableForeignKey({
            columnNames: ['userUuid'],
            referencedTableName: 'user',
            referencedColumnNames: ['uuid'],
            onDelete: 'NO ACTION',
            onUpdate: 'NO ACTION'
          }),
          new TableForeignKey({
            columnNames: ['eventUuid'],
            referencedTableName: 'event',
            referencedColumnNames: ['uuid'],
            onDelete: 'NO ACTION',
            onUpdate: 'NO ACTION'
          }),
          new TableForeignKey({
            columnNames: ['ticketTypeUuid'],
            referencedTableName: 'ticket_type',
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
    await queryRunner.dropTable('ticket', true);
    await queryRunner.dropTable('order_item', true);
    await queryRunner.dropTable('orders', true);
  }
}
