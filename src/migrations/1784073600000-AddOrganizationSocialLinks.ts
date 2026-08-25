import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Redes / referencias opcionales de productora (no bloquean submit-validation).
 * verificationReference deja de ser obligatorio en producto; la columna se conserva por compatibilidad.
 */
export class AddOrganizationSocialLinks1784073600000 implements MigrationInterface {
  name = 'AddOrganizationSocialLinks1784073600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('organization', [
      new TableColumn({
        name: 'website',
        type: 'varchar',
        length: '255',
        isNullable: true,
        default: null
      }),
      new TableColumn({
        name: 'instagram',
        type: 'varchar',
        length: '255',
        isNullable: true,
        default: null
      }),
      new TableColumn({
        name: 'tiktok',
        type: 'varchar',
        length: '255',
        isNullable: true,
        default: null
      }),
      new TableColumn({
        name: 'facebook',
        type: 'varchar',
        length: '255',
        isNullable: true,
        default: null
      }),
      new TableColumn({
        name: 'socialX',
        type: 'varchar',
        length: '255',
        isNullable: true,
        default: null
      })
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('organization', 'socialX');
    await queryRunner.dropColumn('organization', 'facebook');
    await queryRunner.dropColumn('organization', 'tiktok');
    await queryRunner.dropColumn('organization', 'instagram');
    await queryRunner.dropColumn('organization', 'website');
  }
}
