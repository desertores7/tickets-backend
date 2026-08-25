import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Flag de 2FA por email (BR-AUTH-011). Default false; el toggle de producto viene después.
 */
export class AddUserTwoAuthentication1783468800000 implements MigrationInterface {
  name = 'AddUserTwoAuthentication1783468800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'user',
      new TableColumn({
        name: 'twoAuthentication',
        type: 'tinyint',
        width: 1,
        isNullable: false,
        default: 0
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('user', 'twoAuthentication');
  }
}
