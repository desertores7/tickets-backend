import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

/**
 * organization_status lookup + FK en organization;
 * reordena columnas; elimina verificationReference y enum validationStatus.
 */
export class OrganizationStatusAndReorder1784160000000 implements MigrationInterface {
  name = 'OrganizationStatusAndReorder1784160000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'organization_status',
        columns: [
          { name: 'uuid', type: 'varchar', length: '36', isPrimary: true },
          { name: 'name', type: 'varchar', length: '50', isNullable: false, isUnique: true },
          { name: 'isDeleted', type: 'date', isNullable: true, default: null },
          {
            name: 'createdAt',
            type: 'timestamp',
            precision: 3,
            isNullable: true,
            default: 'CURRENT_TIMESTAMP(3)'
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            precision: 3,
            isNullable: true,
            default: 'CURRENT_TIMESTAMP(3)',
            onUpdate: 'CURRENT_TIMESTAMP(3)'
          },
          { name: 'createdBy', type: 'varchar', isNullable: true, default: null },
          { name: 'updatedBy', type: 'varchar', isNullable: true, default: null }
        ]
      }),
      true
    );

    await queryRunner.query(`
      INSERT INTO \`organization_status\` (\`uuid\`, \`name\`, \`isDeleted\`, \`createdAt\`, \`updatedAt\`)
      VALUES
        ('a1111111-1111-4111-8111-111111111101', 'draft_incomplete', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
        ('a1111111-1111-4111-8111-111111111102', 'pending_review', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
        ('a1111111-1111-4111-8111-111111111103', 'approved', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
        ('a1111111-1111-4111-8111-111111111104', 'rejected', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
    `);

    await queryRunner.query(`
      ALTER TABLE \`organization\`
      ADD \`organizationStatusUuid\` varchar(36) NULL
    `);

    await queryRunner.query(`
      UPDATE \`organization\` SET \`organizationStatusUuid\` = CASE \`validationStatus\`
        WHEN 'pending_review' THEN 'a1111111-1111-4111-8111-111111111102'
        WHEN 'approved' THEN 'a1111111-1111-4111-8111-111111111103'
        WHEN 'rejected' THEN 'a1111111-1111-4111-8111-111111111104'
        ELSE 'a1111111-1111-4111-8111-111111111101'
      END
    `);

    await queryRunner.query(`
      ALTER TABLE \`organization\`
      MODIFY \`organizationStatusUuid\` varchar(36) NOT NULL
    `);

    await queryRunner.createForeignKey(
      'organization',
      new TableForeignKey({
        name: 'FK_organization_organization_status',
        columnNames: ['organizationStatusUuid'],
        referencedTableName: 'organization_status',
        referencedColumnNames: ['uuid'],
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
      })
    );

    await queryRunner.createIndex(
      'organization',
      new TableIndex({
        name: 'IDX_organization_status',
        columnNames: ['organizationStatusUuid']
      })
    );

    // Drop deprecated / replaced columns
    await queryRunner.query(`ALTER TABLE \`organization\` DROP COLUMN \`validationStatus\``);
    await queryRunner.query(`ALTER TABLE \`organization\` DROP COLUMN \`verificationReference\``);

    // Reorder columns (MySQL): identity → status → fiscal → social → audit
    await queryRunner.query(`
      ALTER TABLE \`organization\`
        MODIFY \`uuid\` varchar(36) NOT NULL FIRST,
        MODIFY \`name\` varchar(255) NOT NULL AFTER \`uuid\`,
        MODIFY \`active\` int NOT NULL DEFAULT 1 AFTER \`name\`,
        MODIFY \`organizationStatusUuid\` varchar(36) NOT NULL AFTER \`active\`,
        MODIFY \`rejectionReason\` text NULL AFTER \`organizationStatusUuid\`,
        MODIFY \`validationSubmittedAt\` timestamp(3) NULL AFTER \`rejectionReason\`,
        MODIFY \`validationResolvedAt\` timestamp(3) NULL AFTER \`validationSubmittedAt\`,
        MODIFY \`legalName\` varchar(255) NULL AFTER \`validationResolvedAt\`,
        MODIFY \`taxId\` varchar(20) NULL AFTER \`legalName\`,
        MODIFY \`taxCondition\` enum('monotributo','responsable_inscripto','exento') NULL AFTER \`taxId\`,
        MODIFY \`bankAccount\` varchar(100) NULL AFTER \`taxCondition\`,
        MODIFY \`contactEmail\` varchar(255) NULL AFTER \`bankAccount\`,
        MODIFY \`contactPhone\` varchar(50) NULL AFTER \`contactEmail\`,
        MODIFY \`website\` varchar(255) NULL AFTER \`contactPhone\`,
        MODIFY \`instagram\` varchar(255) NULL AFTER \`website\`,
        MODIFY \`tiktok\` varchar(255) NULL AFTER \`instagram\`,
        MODIFY \`facebook\` varchar(255) NULL AFTER \`tiktok\`,
        MODIFY \`socialX\` varchar(255) NULL AFTER \`facebook\`,
        MODIFY \`isDeleted\` date NULL AFTER \`socialX\`,
        MODIFY \`createdAt\` timestamp(3) NULL DEFAULT CURRENT_TIMESTAMP(3) AFTER \`isDeleted\`,
        MODIFY \`updatedAt\` timestamp(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) AFTER \`createdAt\`,
        MODIFY \`createdBy\` varchar(255) NULL AFTER \`updatedAt\`,
        MODIFY \`updatedBy\` varchar(255) NULL AFTER \`createdBy\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`organization\`
      ADD \`validationStatus\` enum('draft_incomplete','pending_review','approved','rejected')
        NOT NULL DEFAULT 'draft_incomplete'
    `);
    await queryRunner.query(`
      ALTER TABLE \`organization\`
      ADD \`verificationReference\` varchar(500) NULL
    `);
    await queryRunner.query(`
      UPDATE \`organization\` SET \`validationStatus\` = CASE \`organizationStatusUuid\`
        WHEN 'a1111111-1111-4111-8111-111111111102' THEN 'pending_review'
        WHEN 'a1111111-1111-4111-8111-111111111103' THEN 'approved'
        WHEN 'a1111111-1111-4111-8111-111111111104' THEN 'rejected'
        ELSE 'draft_incomplete'
      END
    `);

    await queryRunner.dropForeignKey('organization', 'FK_organization_organization_status');
    await queryRunner.dropIndex('organization', 'IDX_organization_status');
    await queryRunner.query(`ALTER TABLE \`organization\` DROP COLUMN \`organizationStatusUuid\``);
    await queryRunner.dropTable('organization_status');
  }
}
