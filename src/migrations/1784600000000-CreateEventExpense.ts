import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

const uuidPrimaryColumn = {
  name: 'uuid',
  type: 'varchar',
  length: '36',
  isPrimary: true
} as const;

/** Líneas de costo por evento (FP08 / BR-BACKOFFICE-006). */
export class CreateEventExpense1784600000000 implements MigrationInterface {
  name = 'CreateEventExpense1784600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'event_expense',
        columns: [
          uuidPrimaryColumn,
          { name: 'eventUuid', type: 'varchar', length: '36', isNullable: false },
          {
            name: 'category',
            type: 'enum',
            enum: [
              'seguridad',
              'personal',
              'comida',
              'bebidas',
              'venue',
              'produccion',
              'marketing',
              'transporte',
              'permisos',
              'otro'
            ],
            isNullable: false
          },
          { name: 'concept', type: 'varchar', length: '255', isNullable: false },
          { name: 'supplier', type: 'varchar', length: '255', isNullable: false },
          { name: 'quantity', type: 'decimal', precision: 12, scale: 2, isNullable: false },
          { name: 'unitCost', type: 'decimal', precision: 12, scale: 2, isNullable: false },
          { name: 'totalAmount', type: 'decimal', precision: 14, scale: 2, isNullable: false },
          { name: 'expenseDate', type: 'date', isNullable: false },
          { name: 'notes', type: 'text', isNullable: true, default: null },
          { name: 'createdBy', type: 'varchar', length: '36', isNullable: true, default: null },
          { name: 'isDeleted', type: 'date', isNullable: true, default: null },
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
        ],
        indices: [
          // Consulta principal: gastos vigentes de un evento
          new TableIndex({ name: 'IDX_event_expense_event', columnNames: ['eventUuid', 'isDeleted'] }),
          // Agregado del dashboard: total por categoría
          new TableIndex({ name: 'IDX_event_expense_category', columnNames: ['eventUuid', 'category'] })
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['eventUuid'],
            referencedTableName: 'event',
            referencedColumnNames: ['uuid'],
            onDelete: 'CASCADE',
            onUpdate: 'NO ACTION'
          }),
          new TableForeignKey({
            columnNames: ['createdBy'],
            referencedTableName: 'user',
            referencedColumnNames: ['uuid'],
            onDelete: 'SET NULL',
            onUpdate: 'NO ACTION'
          })
        ]
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('event_expense', true);
  }
}
