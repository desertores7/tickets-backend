import { MigrationInterface, QueryRunner } from 'typeorm';

export const CLIENTE_ROLE_UUID = 'd4f8a1c3-5b27-4e69-9a04-3c71e8b5d2f6';

/**
 * Rol para compradores de entradas: es el que recibe todo usuario que se
 * registra desde el sitio público. Sin acceso al backoffice — solo su perfil,
 * comprar y ver sus tickets.
 *
 * Antes `registerAuth` asignaba un roleUuid hardcodeado heredado del proyecto
 * base que no existe en esta base de datos; como `user_role` tiene FK contra
 * `role`, el registro público fallaba.
 */
export class SeedClienteRole1782604800000 implements MigrationInterface {
  name = 'SeedClienteRole1782604800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT INTO \`role\` (\`uuid\`, \`name\`, \`isDeleted\`, \`createdAt\`, \`updatedAt\`, \`createdBy\`, \`updatedBy\`)
      VALUES (?, 'Cliente', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL, NULL)
      ON DUPLICATE KEY UPDATE
        \`name\` = VALUES(\`name\`),
        \`isDeleted\` = VALUES(\`isDeleted\`),
        \`updatedAt\` = VALUES(\`updatedAt\`)
      `,
      [CLIENTE_ROLE_UUID]
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM \`user_role\` WHERE \`roleUuid\` = ?`, [CLIENTE_ROLE_UUID]);
    await queryRunner.query(`DELETE FROM \`role\` WHERE \`uuid\` = ?`, [CLIENTE_ROLE_UUID]);
  }
}
