import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

const uuidPk = { name: 'uuid', type: 'varchar', length: '36', isPrimary: true } as const;
const audit = [
  { name: 'isDeleted', type: 'boolean', isNullable: true, default: null },
  { name: 'createdAt', type: 'timestamp', precision: 3, default: 'CURRENT_TIMESTAMP(3)' },
  {
    name: 'updatedAt',
    type: 'timestamp',
    precision: 3,
    default: 'CURRENT_TIMESTAMP(3)',
    onUpdate: 'CURRENT_TIMESTAMP(3)'
  }
];

/** Caja / ingresos del evento (FP11 / BR-CASH-003 a 014). */
export class CreateEventCash1785200000000 implements MigrationInterface {
  name = 'CreateEventCash1785200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Cuentas MP asignadas al evento (BR-CASH-010). Cero es valido: significa
    // que ese evento solo registra ingresos manuales.
    await queryRunner.createTable(
      new Table({
        name: 'event_mp_account',
        columns: [
          uuidPk,
          { name: 'eventUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'orgMpAccountUuid', type: 'varchar', length: '36', isNullable: false },
          ...audit
        ]
      }),
      true
    );
    await queryRunner.createForeignKey('event_mp_account', new TableForeignKey({
      name: 'FK_event_mp_account_event', columnNames: ['eventUuid'],
      referencedTableName: 'event', referencedColumnNames: ['uuid'], onDelete: 'CASCADE'
    }));
    await queryRunner.createForeignKey('event_mp_account', new TableForeignKey({
      name: 'FK_event_mp_account_account', columnNames: ['orgMpAccountUuid'],
      referencedTableName: 'org_mp_account', referencedColumnNames: ['uuid'], onDelete: 'CASCADE'
    }));
    await queryRunner.createIndex('event_mp_account', new TableIndex({
      name: 'UQ_event_mp_account', columnNames: ['eventUuid', 'orgMpAccountUuid'], isUnique: true
    }));

    // Ingresos (BR-CASH-009). No hay entidad de caja fisica (BR-CASH-013):
    // quien cobro queda en createdBy.
    await queryRunner.createTable(
      new Table({
        name: 'event_income',
        columns: [
          uuidPk,
          { name: 'eventUuid', type: 'varchar', length: '36', isNullable: false },
          {
            name: 'source', type: 'enum', enum: ['manual', 'mp_auto'],
            isNullable: false, default: "'manual'"
          },
          {
            name: 'method', type: 'enum', enum: ['cash', 'mercadopago', 'other'],
            isNullable: false
          },
          { name: 'occurredAt', type: 'timestamp', precision: 3, isNullable: false },
          { name: 'notes', type: 'text', isNullable: true, default: null },
          { name: 'total', type: 'decimal', precision: 14, scale: 2, isNullable: false, default: 0 },
          { name: 'mpMovementUuid', type: 'varchar', length: '36', isNullable: true, default: null },
          { name: 'createdBy', type: 'varchar', length: '36', isNullable: true, default: null },
          ...audit
        ]
      }),
      true
    );
    await queryRunner.createForeignKey('event_income', new TableForeignKey({
      name: 'FK_event_income_event', columnNames: ['eventUuid'],
      referencedTableName: 'event', referencedColumnNames: ['uuid'], onDelete: 'CASCADE'
    }));
    // El resumen consulta por evento y ordena por fecha del cobro.
    await queryRunner.createIndex('event_income', new TableIndex({
      name: 'IDX_event_income_event_occurred', columnNames: ['eventUuid', 'occurredAt']
    }));

    // Productos del ingreso. `name` y `unitPrice` son una foto al momento del
    // cobro: cambiar el catalogo despues no altera ventas ya registradas.
    await queryRunner.createTable(
      new Table({
        name: 'event_income_product',
        columns: [
          uuidPk,
          { name: 'eventIncomeUuid', type: 'varchar', length: '36', isNullable: false },
          {
            name: 'type', type: 'enum',
            enum: ['mp_catalog', 'manual', 'entrada', 'otros'], isNullable: false
          },
          { name: 'referenceUuid', type: 'varchar', length: '36', isNullable: true, default: null },
          { name: 'name', type: 'varchar', length: '255', isNullable: false },
          { name: 'quantity', type: 'decimal', precision: 12, scale: 2, isNullable: false },
          { name: 'unitPrice', type: 'decimal', precision: 12, scale: 2, isNullable: false },
          { name: 'subtotal', type: 'decimal', precision: 14, scale: 2, isNullable: false },
          { name: 'createdAt', type: 'timestamp', precision: 3, default: 'CURRENT_TIMESTAMP(3)' }
        ]
      }),
      true
    );
    await queryRunner.createForeignKey('event_income_product', new TableForeignKey({
      name: 'FK_event_income_product_income', columnNames: ['eventIncomeUuid'],
      referencedTableName: 'event_income', referencedColumnNames: ['uuid'], onDelete: 'CASCADE'
    }));

    // Movimientos MP (BR-CASH-003).
    await queryRunner.createTable(
      new Table({
        name: 'mp_movement',
        columns: [
          uuidPk,
          { name: 'eventUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'orgMpAccountUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'mpPaymentId', type: 'varchar', length: '64', isNullable: false },
          { name: 'amount', type: 'decimal', precision: 14, scale: 2, isNullable: false },
          {
            name: 'type', type: 'enum',
            enum: ['posnet_catalogo', 'transferencia', 'egreso_mp', 'otro'],
            isNullable: false, default: "'otro'"
          },
          { name: 'occurredAt', type: 'timestamp', precision: 3, isNullable: false },
          { name: 'rawItems', type: 'json', isNullable: true, default: null },
          { name: 'eventIncomeUuid', type: 'varchar', length: '36', isNullable: true, default: null },
          ...audit
        ]
      }),
      true
    );
    await queryRunner.createForeignKey('mp_movement', new TableForeignKey({
      name: 'FK_mp_movement_event', columnNames: ['eventUuid'],
      referencedTableName: 'event', referencedColumnNames: ['uuid'], onDelete: 'CASCADE'
    }));
    await queryRunner.createForeignKey('mp_movement', new TableForeignKey({
      name: 'FK_mp_movement_account', columnNames: ['orgMpAccountUuid'],
      referencedTableName: 'org_mp_account', referencedColumnNames: ['uuid'], onDelete: 'CASCADE'
    }));
    // Idempotencia del job: corre cada 5 min sobre ventanas que se solapan, asi
    // que la garantia es el indice, no el codigo.
    await queryRunner.createIndex('mp_movement', new TableIndex({
      name: 'UQ_mp_movement_account_payment',
      columnNames: ['orgMpAccountUuid', 'mpPaymentId'], isUnique: true
    }));
    await queryRunner.createIndex('mp_movement', new TableIndex({
      name: 'IDX_mp_movement_event_occurred', columnNames: ['eventUuid', 'occurredAt']
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('mp_movement', true);
    await queryRunner.dropTable('event_income_product', true);
    await queryRunner.dropTable('event_income', true);
    await queryRunner.dropTable('event_mp_account', true);
  }
}
