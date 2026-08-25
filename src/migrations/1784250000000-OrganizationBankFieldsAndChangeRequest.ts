import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reemplaza bankAccount por banco / CBU / alias;
 * agrega campos de solicitud de cambio de cuenta (sin tocar validationStatus).
 */
export class OrganizationBankFieldsAndChangeRequest1784250000000 implements MigrationInterface {
  name = 'OrganizationBankFieldsAndChangeRequest1784250000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`organization\`
        ADD \`bankName\` varchar(100) NULL AFTER \`taxCondition\`,
        ADD \`cbu\` varchar(22) NULL AFTER \`bankName\`,
        ADD \`bankAlias\` varchar(100) NULL AFTER \`cbu\`,
        ADD \`pendingBankName\` varchar(100) NULL AFTER \`bankAlias\`,
        ADD \`pendingCbu\` varchar(22) NULL AFTER \`pendingBankName\`,
        ADD \`pendingBankAlias\` varchar(100) NULL AFTER \`pendingCbu\`,
        ADD \`bankChangeRequestedAt\` timestamp(3) NULL AFTER \`pendingBankAlias\`,
        ADD \`bankChangeRejectionReason\` text NULL AFTER \`bankChangeRequestedAt\`
    `);

    await queryRunner.query(`
      UPDATE \`organization\`
      SET
        \`cbu\` = IF(
          LENGTH(REGEXP_REPLACE(\`bankAccount\`, '[^0-9]', '')) = 22,
          REGEXP_REPLACE(\`bankAccount\`, '[^0-9]', ''),
          NULL
        ),
        \`bankAlias\` = IF(
          LENGTH(REGEXP_REPLACE(\`bankAccount\`, '[^0-9]', '')) = 22,
          NULL,
          NULLIF(TRIM(\`bankAccount\`), '')
        )
      WHERE \`bankAccount\` IS NOT NULL AND TRIM(\`bankAccount\`) <> ''
    `);

    await queryRunner.query(`
      ALTER TABLE \`organization\`
        DROP COLUMN \`bankAccount\`,
        MODIFY \`contactEmail\` varchar(255) NULL AFTER \`bankChangeRejectionReason\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`organization\`
        ADD \`bankAccount\` varchar(100) NULL AFTER \`taxCondition\`
    `);

    await queryRunner.query(`
      UPDATE \`organization\`
      SET \`bankAccount\` = COALESCE(\`cbu\`, \`bankAlias\`)
      WHERE \`cbu\` IS NOT NULL OR \`bankAlias\` IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE \`organization\`
        DROP COLUMN \`bankChangeRejectionReason\`,
        DROP COLUMN \`bankChangeRequestedAt\`,
        DROP COLUMN \`pendingBankAlias\`,
        DROP COLUMN \`pendingCbu\`,
        DROP COLUMN \`pendingBankName\`,
        DROP COLUMN \`bankAlias\`,
        DROP COLUMN \`cbu\`,
        DROP COLUMN \`bankName\`,
        MODIFY \`contactEmail\` varchar(255) NULL AFTER \`bankAccount\`
    `);
  }
}
