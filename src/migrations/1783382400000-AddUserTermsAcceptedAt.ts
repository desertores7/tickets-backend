import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Evidencia de aceptación de TyC / +18 en el registro de Cliente.
 * NULL = no aceptó (usuarios legacy o alta interna); timestamp = cuándo aceptó.
 */
export class AddUserTermsAcceptedAt1783382400000 implements MigrationInterface {
  name = 'AddUserTermsAcceptedAt1783382400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'user',
      new TableColumn({
        name: 'termsAcceptedAt',
        type: 'timestamp',
        precision: 3,
        isNullable: true,
        default: null
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('user', 'termsAcceptedAt');
  }
}
