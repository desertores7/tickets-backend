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

export class CreatePayment1781913600000 implements MigrationInterface {
  name = 'CreatePayment1781913600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'payment',
        columns: [
          uuidPrimaryColumn,
          { name: 'orderUuid', type: 'varchar', length: '36', isNullable: false, isUnique: true },
          {
            name: 'provider',
            type: 'enum',
            enum: ['mercadopago', 'dlocal'],
            isNullable: false
          },
          { name: 'providerPaymentId', type: 'varchar', length: '255', isNullable: false },
          { name: 'providerStatus', type: 'varchar', length: '100', isNullable: false },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'approved', 'rejected', 'refunded', 'cancelled', 'in_process'],
            isNullable: false,
            default: "'pending'"
          },
          { name: 'amount', type: 'decimal', precision: 10, scale: 2, isNullable: false },
          { name: 'currency', type: 'varchar', length: '3', isNullable: false },
          { name: 'paymentMethod', type: 'varchar', length: '100', isNullable: true, default: null },
          { name: 'paymentType', type: 'varchar', length: '50', isNullable: true, default: null },
          { name: 'installments', type: 'int', isNullable: true, default: null },
          { name: 'rawResponse', type: 'json', isNullable: false },
          ...timestampColumns
        ],
        indices: [
          new TableIndex({ name: 'IDX_payment_orderUuid', columnNames: ['orderUuid'], isUnique: true }),
          new TableIndex({
            name: 'IDX_payment_provider_providerPaymentId',
            columnNames: ['provider', 'providerPaymentId'],
            isUnique: true
          }),
          new TableIndex({ name: 'IDX_payment_status', columnNames: ['status'] }),
          new TableIndex({ name: 'IDX_payment_provider', columnNames: ['provider'] })
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['orderUuid'],
            referencedTableName: 'orders',
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
    await queryRunner.dropTable('payment', true);
  }
}
