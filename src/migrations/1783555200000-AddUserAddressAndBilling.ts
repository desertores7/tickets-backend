import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Dirección + datos de facturación opcionales del Cliente (BR-CLIENT-AREA-007).
 */
export class AddUserAddressAndBilling1783555200000 implements MigrationInterface {
  name = 'AddUserAddressAndBilling1783555200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'user',
      new TableColumn({
        name: 'address',
        type: 'varchar',
        length: '255',
        isNullable: true,
        default: null
      })
    );

    await queryRunner.addColumn(
      'user',
      new TableColumn({
        name: 'billingIdType',
        type: 'enum',
        enum: ['DNI', 'CUIT/CUIL'],
        isNullable: true,
        default: null
      })
    );

    await queryRunner.addColumn(
      'user',
      new TableColumn({
        name: 'billingIdNumber',
        type: 'varchar',
        length: '30',
        isNullable: true,
        default: null
      })
    );

    await queryRunner.addColumn(
      'user',
      new TableColumn({
        name: 'billingLegalName',
        type: 'varchar',
        length: '255',
        isNullable: true,
        default: null
      })
    );

    await queryRunner.addColumn(
      'user',
      new TableColumn({
        name: 'billingVatCondition',
        type: 'enum',
        enum: ['Consumidor final', 'Monotributo', 'Responsable inscripto', 'Exento'],
        isNullable: true,
        default: null
      })
    );

    await queryRunner.addColumn(
      'user',
      new TableColumn({
        name: 'billingFiscalAddress',
        type: 'varchar',
        length: '255',
        isNullable: true,
        default: null
      })
    );

    await queryRunner.addColumn(
      'user',
      new TableColumn({
        name: 'billingEmail',
        type: 'varchar',
        length: '100',
        isNullable: true,
        default: null
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('user', 'billingEmail');
    await queryRunner.dropColumn('user', 'billingFiscalAddress');
    await queryRunner.dropColumn('user', 'billingVatCondition');
    await queryRunner.dropColumn('user', 'billingLegalName');
    await queryRunner.dropColumn('user', 'billingIdNumber');
    await queryRunner.dropColumn('user', 'billingIdType');
    await queryRunner.dropColumn('user', 'address');
  }
}
