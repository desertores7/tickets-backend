import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Tipo de documento de identidad del usuario (BR-AUTH-006).
 * Nullable para cuentas existentes; obligatorio en registro de Cliente nuevo.
 * El número se sigue guardando en `dni`.
 */
export class AddUserDocumentType1783296000000 implements MigrationInterface {
  name = 'AddUserDocumentType1783296000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'user',
      new TableColumn({
        name: 'documentType',
        type: 'enum',
        enum: ['DNI', 'Pasaporte', 'Documento extranjero', 'Otro'],
        isNullable: true,
        default: null
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('user', 'documentType');
  }
}
