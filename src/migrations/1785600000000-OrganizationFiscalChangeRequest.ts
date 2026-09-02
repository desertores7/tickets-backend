import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Centraliza solicitudes de revisión (cambio bancario / fiscal) en organization_request.
 * Migra pending* bancarios existentes y limpia columnas pending de organization.
 * Si corriste un 178560 viejo con columnas fiscal pending, también las elimina.
 */
export class OrganizationRequestTable1785600000000 implements MigrationInterface {
  name = 'OrganizationRequestTable1785600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`organization_request\` (
        \`uuid\` varchar(36) NOT NULL,
        \`organizationUuid\` varchar(36) NOT NULL,
        \`type\` enum('bank_change','fiscal_change') NOT NULL,
        \`status\` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
        \`payload\` json NOT NULL,
        \`rejectionReason\` text NULL,
        \`resolvedAt\` timestamp(3) NULL,
        \`resolvedByUuid\` varchar(36) NULL,
        \`isDeleted\` date NULL,
        \`createdAt\` timestamp(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` timestamp(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`createdBy\` varchar(255) NULL,
        \`updatedBy\` varchar(255) NULL,
        PRIMARY KEY (\`uuid\`),
        KEY \`IDX_organization_request_org\` (\`organizationUuid\`),
        KEY \`IDX_organization_request_status_type\` (\`status\`, \`type\`),
        CONSTRAINT \`FK_organization_request_organization\`
          FOREIGN KEY (\`organizationUuid\`) REFERENCES \`organization\`(\`uuid\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    const bankCols = await queryRunner.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'organization'
        AND COLUMN_NAME = 'bankChangeRequestedAt'
    `);

    if (bankCols.length > 0) {
      await queryRunner.query(`
        INSERT INTO \`organization_request\` (
          \`uuid\`, \`organizationUuid\`, \`type\`, \`status\`, \`payload\`,
          \`rejectionReason\`, \`resolvedAt\`, \`resolvedByUuid\`,
          \`isDeleted\`, \`createdAt\`, \`updatedAt\`, \`createdBy\`, \`updatedBy\`
        )
        SELECT
          UUID(),
          \`uuid\`,
          'bank_change',
          'pending',
          JSON_OBJECT(
            'bankName', COALESCE(\`pendingBankName\`, ''),
            'cbu', COALESCE(\`pendingCbu\`, ''),
            'bankAlias', COALESCE(\`pendingBankAlias\`, '')
          ),
          NULL,
          NULL,
          NULL,
          NULL,
          COALESCE(\`bankChangeRequestedAt\`, CURRENT_TIMESTAMP(3)),
          CURRENT_TIMESTAMP(3),
          NULL,
          NULL
        FROM \`organization\`
        WHERE \`bankChangeRequestedAt\` IS NOT NULL
          AND \`isDeleted\` IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM \`organization_request\` r
            WHERE r.\`organizationUuid\` = \`organization\`.\`uuid\`
              AND r.\`type\` = 'bank_change'
              AND r.\`status\` = 'pending'
              AND r.\`isDeleted\` IS NULL
          )
      `);

      await queryRunner.query(`
        INSERT INTO \`organization_request\` (
          \`uuid\`, \`organizationUuid\`, \`type\`, \`status\`, \`payload\`,
          \`rejectionReason\`, \`resolvedAt\`, \`resolvedByUuid\`,
          \`isDeleted\`, \`createdAt\`, \`updatedAt\`, \`createdBy\`, \`updatedBy\`
        )
        SELECT
          UUID(),
          \`uuid\`,
          'bank_change',
          'rejected',
          JSON_OBJECT('bankName', '', 'cbu', '', 'bankAlias', ''),
          \`bankChangeRejectionReason\`,
          CURRENT_TIMESTAMP(3),
          NULL,
          NULL,
          CURRENT_TIMESTAMP(3),
          CURRENT_TIMESTAMP(3),
          NULL,
          NULL
        FROM \`organization\`
        WHERE \`bankChangeRequestedAt\` IS NULL
          AND \`bankChangeRejectionReason\` IS NOT NULL
          AND TRIM(\`bankChangeRejectionReason\`) <> ''
          AND \`isDeleted\` IS NULL
      `);

      await queryRunner.query(`
        ALTER TABLE \`organization\`
          DROP COLUMN \`bankChangeRejectionReason\`,
          DROP COLUMN \`bankChangeRequestedAt\`,
          DROP COLUMN \`pendingBankAlias\`,
          DROP COLUMN \`pendingCbu\`,
          DROP COLUMN \`pendingBankName\`
      `);
    }

    const fiscalCols = await queryRunner.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'organization'
        AND COLUMN_NAME = 'fiscalChangeRequestedAt'
    `);

    if (fiscalCols.length > 0) {
      await queryRunner.query(`
        INSERT INTO \`organization_request\` (
          \`uuid\`, \`organizationUuid\`, \`type\`, \`status\`, \`payload\`,
          \`rejectionReason\`, \`resolvedAt\`, \`resolvedByUuid\`,
          \`isDeleted\`, \`createdAt\`, \`updatedAt\`, \`createdBy\`, \`updatedBy\`
        )
        SELECT
          UUID(),
          \`uuid\`,
          'fiscal_change',
          'pending',
          JSON_OBJECT(
            'name', COALESCE(\`pendingName\`, \`name\`),
            'legalName', COALESCE(\`pendingLegalName\`, ''),
            'taxId', COALESCE(\`pendingTaxId\`, ''),
            'taxCondition', \`pendingTaxCondition\`,
            'contactEmail', COALESCE(\`pendingContactEmail\`, '')
          ),
          NULL,
          NULL,
          NULL,
          NULL,
          COALESCE(\`fiscalChangeRequestedAt\`, CURRENT_TIMESTAMP(3)),
          CURRENT_TIMESTAMP(3),
          NULL,
          NULL
        FROM \`organization\`
        WHERE \`fiscalChangeRequestedAt\` IS NOT NULL
          AND \`isDeleted\` IS NULL
      `);

      await queryRunner.query(`
        ALTER TABLE \`organization\`
          DROP COLUMN \`fiscalChangeRejectionReason\`,
          DROP COLUMN \`fiscalChangeRequestedAt\`,
          DROP COLUMN \`pendingContactEmail\`,
          DROP COLUMN \`pendingTaxCondition\`,
          DROP COLUMN \`pendingTaxId\`,
          DROP COLUMN \`pendingLegalName\`,
          DROP COLUMN \`pendingName\`
      `);
    }

    await queryRunner.query(`
      ALTER TABLE \`organization\`
        MODIFY \`contactEmail\` varchar(255) NULL AFTER \`bankAlias\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`organization\`
        ADD \`pendingBankName\` varchar(100) NULL AFTER \`bankAlias\`,
        ADD \`pendingCbu\` varchar(22) NULL AFTER \`pendingBankName\`,
        ADD \`pendingBankAlias\` varchar(100) NULL AFTER \`pendingCbu\`,
        ADD \`bankChangeRequestedAt\` timestamp(3) NULL AFTER \`pendingBankAlias\`,
        ADD \`bankChangeRejectionReason\` text NULL AFTER \`bankChangeRequestedAt\`
    `);

    await queryRunner.query(`
      UPDATE \`organization\` o
      INNER JOIN \`organization_request\` r
        ON r.\`organizationUuid\` = o.\`uuid\`
       AND r.\`type\` = 'bank_change'
       AND r.\`status\` = 'pending'
       AND r.\`isDeleted\` IS NULL
      SET
        o.\`pendingBankName\` = JSON_UNQUOTE(JSON_EXTRACT(r.\`payload\`, '$.bankName')),
        o.\`pendingCbu\` = JSON_UNQUOTE(JSON_EXTRACT(r.\`payload\`, '$.cbu')),
        o.\`pendingBankAlias\` = JSON_UNQUOTE(JSON_EXTRACT(r.\`payload\`, '$.bankAlias')),
        o.\`bankChangeRequestedAt\` = r.\`createdAt\`
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS \`organization_request\``);

    await queryRunner.query(`
      ALTER TABLE \`organization\`
        MODIFY \`contactEmail\` varchar(255) NULL AFTER \`bankChangeRejectionReason\`
    `);
  }
}
