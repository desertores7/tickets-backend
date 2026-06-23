import { MigrationInterface, QueryRunner } from 'typeorm';

const DEFAULT_ROLES = [
  {
    uuid: '19acc391-c8dc-423f-9771-2503d697768c',
    name: 'Administrador',
    createdAt: '2025-12-12 20:45:49',
    updatedAt: '2025-12-12 20:45:52'
  },
  {
    uuid: 'f06dadd4-224c-42f2-878f-84ba153eadc2',
    name: 'Operador',
    createdAt: '2025-12-12 23:20:25',
    updatedAt: '2025-12-12 23:20:25'
  }
] as const;

export class SeedDefaultRoles1781635300000 implements MigrationInterface {
  name = 'SeedDefaultRoles1781635300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const role of DEFAULT_ROLES) {
      await queryRunner.query(
        `
        INSERT INTO \`role\` (\`uuid\`, \`name\`, \`isDeleted\`, \`createdAt\`, \`updatedAt\`, \`createdBy\`, \`updatedBy\`)
        VALUES (?, ?, NULL, ?, ?, NULL, NULL)
        ON DUPLICATE KEY UPDATE
          \`name\` = VALUES(\`name\`),
          \`isDeleted\` = VALUES(\`isDeleted\`),
          \`updatedAt\` = VALUES(\`updatedAt\`)
        `,
        [role.uuid, role.name, role.createdAt, role.updatedAt]
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const roleUuids = DEFAULT_ROLES.map(role => role.uuid);

    await queryRunner.query(`DELETE FROM \`user_role\` WHERE \`roleUuid\` IN (?, ?)`, roleUuids);
    await queryRunner.query(`DELETE FROM \`role\` WHERE \`uuid\` IN (?, ?)`, roleUuids);
  }
}
