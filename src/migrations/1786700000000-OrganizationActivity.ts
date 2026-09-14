import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bitácora de cambios fiscales/bancarios de productora para el modal Admin
 * «Revisar productora» → Historial de cambios.
 */
export class OrganizationActivity1786700000000 implements MigrationInterface {
  name = 'OrganizationActivity1786700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`organization_activity\` (
        \`uuid\` varchar(36) NOT NULL,
        \`organizationUuid\` varchar(36) NOT NULL,
        \`kind\` enum(
          'identity_saved',
          'bank_saved',
          'docs_uploaded',
          'validation_submitted',
          'validation_withdrawn',
          'validation_approved',
          'validation_rejected',
          'bank_change_requested',
          'bank_change_approved',
          'bank_change_rejected',
          'fiscal_change_requested',
          'fiscal_change_approved',
          'fiscal_change_rejected'
        ) NOT NULL,
        \`title\` varchar(160) NOT NULL,
        \`detail\` varchar(500) NULL,
        \`payload\` json NULL,
        \`actorUserUuid\` varchar(36) NULL,
        \`createdAt\` timestamp(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`uuid\`),
        KEY \`IDX_organization_activity_org_created\` (\`organizationUuid\`, \`createdAt\`),
        CONSTRAINT \`FK_organization_activity_organization\`
          FOREIGN KEY (\`organizationUuid\`) REFERENCES \`organization\`(\`uuid\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`organization_activity\``);
  }
}
