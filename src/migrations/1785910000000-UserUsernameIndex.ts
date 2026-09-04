import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

/**
 * Segunda pasada de la auditoria de performance.
 *
 * `auth.service` consulta `user.username` para verificar unicidad en el registro
 * y en cada actualizacion de perfil, sobre una columna sin indice: hoy es un
 * full scan de la tabla de usuarios en un camino de escritura frecuente.
 *
 * Se agrega como indice comun, no unico: la unicidad de username todavia se
 * valida en la aplicacion y poner el UNIQUE requiere primero limpiar los
 * duplicados que pudieran existir (ver docs/auditoria-performance-y-swagger.md).
 */
export class UserUsernameIndex1785910000000 implements MigrationInterface {
  name = 'UserUsernameIndex1785910000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createIndex(
      'user',
      new TableIndex({ name: 'IDX_user_username', columnNames: ['username'] })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('user', 'IDX_user_username');
  }
}
