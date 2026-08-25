import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

/**
 * Prepara la columna `googleId` para el futuro OAuth de Google.
 * Nullable: las cuentas actuales (email/password) no tienen Google vinculado.
 * Índice único para lookup por subject de Google cuando se implemente OAuth.
 */
export class AddUserGoogleId1783209600000 implements MigrationInterface {
  name = 'AddUserGoogleId1783209600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'user',
      new TableColumn({
        name: 'googleId',
        type: 'varchar',
        length: '255',
        isNullable: true,
        default: null
      })
    );

    await queryRunner.createIndex(
      'user',
      new TableIndex({
        name: 'IDX_user_googleId',
        columnNames: ['googleId'],
        isUnique: true
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('user', 'IDX_user_googleId');
    await queryRunner.dropColumn('user', 'googleId');
  }
}
