import { MigrationInterface, QueryRunner } from 'typeorm';

const VALIDADOR_ROLE = {
  uuid: '3e7a1c52-88f4-4b0d-a9e6-51c2d47b9a03',
  name: 'Validador'
} as const;

/**
 * Rol dedicado para el staff de puerta que escanea QRs en el check-in.
 * Separado de Operador para no heredar permisos de gestión — el personal
 * temporal de un evento solo necesita validar entradas.
 */
export class SeedValidadorRole1782086400000 implements MigrationInterface {
  name = 'SeedValidadorRole1782086400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT INTO \`role\` (\`uuid\`, \`name\`, \`isDeleted\`, \`createdAt\`, \`updatedAt\`, \`createdBy\`, \`updatedBy\`)
      VALUES (?, ?, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL, NULL)
      ON DUPLICATE KEY UPDATE
        \`name\` = VALUES(\`name\`),
        \`isDeleted\` = VALUES(\`isDeleted\`),
        \`updatedAt\` = VALUES(\`updatedAt\`)
      `,
      [VALIDADOR_ROLE.uuid, VALIDADOR_ROLE.name]
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM \`user_role\` WHERE \`roleUuid\` = ?`, [VALIDADOR_ROLE.uuid]);
    await queryRunner.query(`DELETE FROM \`role\` WHERE \`uuid\` = ?`, [VALIDADOR_ROLE.uuid]);
  }
}
