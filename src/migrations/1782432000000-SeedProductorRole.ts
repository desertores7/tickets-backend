import { MigrationInterface, QueryRunner } from 'typeorm';

const PRODUCTOR_ROLE = {
  uuid: '8c41b7d9-2f6e-4a35-b8c1-7d92e4f0a516',
  name: 'Productor'
} as const;

/**
 * Rol para productoras/organizadores: mismo backoffice que el admin, pero
 * acotado a los eventos de las organizaciones a las que pertenece el usuario.
 */
export class SeedProductorRole1782432000000 implements MigrationInterface {
  name = 'SeedProductorRole1782432000000';

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
      [PRODUCTOR_ROLE.uuid, PRODUCTOR_ROLE.name]
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM \`user_role\` WHERE \`roleUuid\` = ?`, [PRODUCTOR_ROLE.uuid]);
    await queryRunner.query(`DELETE FROM \`role\` WHERE \`uuid\` = ?`, [PRODUCTOR_ROLE.uuid]);
  }
}
