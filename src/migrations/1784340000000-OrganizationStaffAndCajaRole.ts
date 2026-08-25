import { MigrationInterface, QueryRunner } from 'typeorm';

const CAJA_ROLE = {
  uuid: 'b2c3d4e5-f6a7-4890-b123-456789abcdef',
  name: 'Caja'
} as const;

export class OrganizationStaffAndCajaRole1784340000000 implements MigrationInterface {
  name = 'OrganizationStaffAndCajaRole1784340000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT INTO \`role\` (\`uuid\`, \`name\`, \`isDeleted\`, \`createdAt\`, \`updatedAt\`, \`createdBy\`, \`updatedBy\`)
      VALUES (?, ?, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL, NULL)
      ON DUPLICATE KEY UPDATE
        \`name\` = VALUES(\`name\`),
        \`isDeleted\` = NULL,
        \`updatedAt\` = VALUES(\`updatedAt\`)
      `,
      [CAJA_ROLE.uuid, CAJA_ROLE.name]
    );

    await queryRunner.query(`
      CREATE TABLE \`organization_producer_invite\` (
        \`uuid\` varchar(36) NOT NULL,
        \`email\` varchar(255) NOT NULL,
        \`organizationUuid\` varchar(36) NOT NULL,
        \`token\` varchar(36) NOT NULL,
        \`invitedByUuid\` varchar(36) NOT NULL,
        \`expiresAt\` timestamp(3) NOT NULL,
        \`acceptedAt\` timestamp(3) NULL,
        \`isUsed\` tinyint(1) NOT NULL DEFAULT 0,
        \`createdAt\` timestamp(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` timestamp(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`uuid\`),
        UNIQUE KEY \`UQ_organization_producer_invite_token\` (\`token\`),
        KEY \`IDX_organization_producer_invite_org\` (\`organizationUuid\`),
        KEY \`IDX_organization_producer_invite_email\` (\`email\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE \`user_event_cashier\` (
        \`uuid\` varchar(36) NOT NULL,
        \`userUuid\` varchar(36) NOT NULL,
        \`eventUuid\` varchar(36) NOT NULL,
        \`organizationUuid\` varchar(36) NOT NULL,
        \`isHidden\` tinyint(1) NOT NULL DEFAULT 0,
        \`isDeleted\` date NULL DEFAULT NULL,
        \`createdAt\` timestamp(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` timestamp(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`createdBy\` varchar(36) NULL,
        PRIMARY KEY (\`uuid\`),
        UNIQUE KEY \`UQ_user_event_cashier\` (\`userUuid\`, \`eventUuid\`),
        KEY \`IDX_user_event_cashier_user\` (\`userUuid\`),
        KEY \`IDX_user_event_cashier_org\` (\`organizationUuid\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`user_event_cashier\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`organization_producer_invite\``);
    await queryRunner.query(`DELETE FROM \`user_role\` WHERE \`roleUuid\` = ?`, [CAJA_ROLE.uuid]);
    await queryRunner.query(`DELETE FROM \`role\` WHERE \`uuid\` = ?`, [CAJA_ROLE.uuid]);
  }
}
