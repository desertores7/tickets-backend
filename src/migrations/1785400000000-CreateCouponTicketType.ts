import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

/** Tandas alcanzadas por un cupón (BR-COUPON-009). */
export class CreateCouponTicketType1785400000000 implements MigrationInterface {
  name = 'CreateCouponTicketType1785400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'coupon_ticket_type',
        columns: [
          { name: 'uuid', type: 'varchar', length: '36', isPrimary: true },
          { name: 'couponUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'ticketTypeUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'createdAt', type: 'timestamp', precision: 3, default: 'CURRENT_TIMESTAMP(3)' }
        ]
      }),
      true
    );

    await queryRunner.createForeignKey('coupon_ticket_type', new TableForeignKey({
      name: 'FK_coupon_ticket_type_coupon', columnNames: ['couponUuid'],
      referencedTableName: 'coupon', referencedColumnNames: ['uuid'], onDelete: 'CASCADE'
    }));
    // Al borrar una tanda cae su restriccion: un cupon limitado a una tanda que
    // ya no existe volveria a aplicar a toda la compra sin que nadie lo decida.
    await queryRunner.createForeignKey('coupon_ticket_type', new TableForeignKey({
      name: 'FK_coupon_ticket_type_ticket_type', columnNames: ['ticketTypeUuid'],
      referencedTableName: 'ticket_type', referencedColumnNames: ['uuid'], onDelete: 'CASCADE'
    }));

    await queryRunner.createIndex('coupon_ticket_type', new TableIndex({
      name: 'UQ_coupon_ticket_type',
      columnNames: ['couponUuid', 'ticketTypeUuid'], isUnique: true
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('coupon_ticket_type', true);
  }
}
