import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

/** Cupones de descuento por evento (FP07 §16 / BR-COUPON-001 a 008). */
export class CreateCoupon1785100000000 implements MigrationInterface {
  name = 'CreateCoupon1785100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'coupon',
        columns: [
          { name: 'uuid', type: 'varchar', length: '36', isPrimary: true },
          { name: 'eventUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'name', type: 'varchar', length: '120', isNullable: false },
          { name: 'code', type: 'varchar', length: '40', isNullable: false },
          { name: 'type', type: 'enum', enum: ['percent', 'fixed'], isNullable: false },
          { name: 'value', type: 'decimal', precision: 12, scale: 2, isNullable: false },
          { name: 'maxUses', type: 'int', isNullable: true, default: null },
          { name: 'usedCount', type: 'int', isNullable: false, default: 0 },
          { name: 'oncePerUser', type: 'boolean', isNullable: false, default: false },
          { name: 'validFrom', type: 'timestamp', precision: 3, isNullable: true, default: null },
          { name: 'validUntil', type: 'timestamp', precision: 3, isNullable: true, default: null },
          { name: 'active', type: 'boolean', isNullable: false, default: true },
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
      'coupon',
      new TableForeignKey({
        name: 'FK_coupon_event',
        columnNames: ['eventUuid'],
        referencedTableName: 'event',
        referencedColumnNames: ['uuid'],
        onDelete: 'CASCADE'
      })
    );

    // Codigo unico dentro del evento. La comparacion es case-insensitive por la
    // collation por defecto de MySQL, y ademas se guarda siempre en mayusculas.
    await queryRunner.createIndex(
      'coupon',
      new TableIndex({
        name: 'UQ_coupon_event_code',
        columnNames: ['eventUuid', 'code'],
        isUnique: true
      })
    );

    await queryRunner.createTable(
      new Table({
        name: 'coupon_redemption',
        columns: [
          { name: 'uuid', type: 'varchar', length: '36', isPrimary: true },
          { name: 'couponUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'orderUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'userUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'discountAmount', type: 'decimal', precision: 12, scale: 2, isNullable: false },
          { name: 'createdAt', type: 'timestamp', precision: 3, default: 'CURRENT_TIMESTAMP(3)' }
        ]
      }),
      true
    );

    await queryRunner.createForeignKey(
      'coupon_redemption',
      new TableForeignKey({
        name: 'FK_coupon_redemption_coupon',
        columnNames: ['couponUuid'],
        referencedTableName: 'coupon',
        referencedColumnNames: ['uuid'],
        onDelete: 'CASCADE'
      })
    );

    // Una orden consume un cupon una sola vez, aunque el webhook de pago se
    // reintente: el indice unico es la garantia, no el codigo.
    await queryRunner.createIndex(
      'coupon_redemption',
      new TableIndex({
        name: 'UQ_coupon_redemption_order',
        columnNames: ['orderUuid'],
        isUnique: true
      })
    );

    // Consulta de "una vez por usuario" (BR-COUPON-003).
    await queryRunner.createIndex(
      'coupon_redemption',
      new TableIndex({
        name: 'IDX_coupon_redemption_coupon_user',
        columnNames: ['couponUuid', 'userUuid']
      })
    );

    // La orden guarda el cupon aplicado y cuanto descontó, para no recalcularlo
    // ni depender de que el cupon siga existiendo con los mismos valores.
    await queryRunner.addColumns('orders', [
      new TableColumn({ name: 'couponUuid', type: 'varchar', length: '36', isNullable: true, default: null }),
      new TableColumn({ name: 'discountAmount', type: 'decimal', precision: 12, scale: 2, isNullable: false, default: 0 })
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('orders', ['couponUuid', 'discountAmount']);
    await queryRunner.dropTable('coupon_redemption', true);
    await queryRunner.dropTable('coupon', true);
  }
}
