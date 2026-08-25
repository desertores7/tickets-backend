import { MigrationInterface, QueryRunner, TableForeignKey, TableIndex } from 'typeorm';

/**
 * Extiende `file` para adjuntos fiscales de org; seed file_type;
 * migra organization_fiscal_document → file y dropea la tabla dedicada.
 */
export class ExtendFileForFiscalDocuments1784160000001 implements MigrationInterface {
  name = 'ExtendFileForFiscalDocuments1784160000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop FK userUuid to allow nullable
    const table = await queryRunner.getTable('file');
    const userFk = table?.foreignKeys.find(fk => fk.columnNames.includes('userUuid'));
    if (userFk) {
      await queryRunner.dropForeignKey('file', userFk);
    }

    await queryRunner.query(`ALTER TABLE \`file\` MODIFY \`userUuid\` varchar(36) NULL`);
    await queryRunner.query(`ALTER TABLE \`file\` MODIFY \`path\` varchar(255) NULL`);

    await queryRunner.query(`ALTER TABLE \`file\` ADD \`organizationUuid\` varchar(36) NULL`);
    await queryRunner.query(`ALTER TABLE \`file\` ADD \`originalName\` varchar(255) NULL`);
    await queryRunner.query(`ALTER TABLE \`file\` ADD \`storedName\` varchar(100) NULL`);
    await queryRunner.query(`ALTER TABLE \`file\` ADD \`sizeBytes\` int NULL`);
    await queryRunner.query(`ALTER TABLE \`file\` ADD \`relativePath\` varchar(500) NULL`);

    await queryRunner.createForeignKey(
      'file',
      new TableForeignKey({
        name: 'FK_file_user',
        columnNames: ['userUuid'],
        referencedTableName: 'user',
        referencedColumnNames: ['uuid'],
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION'
      })
    );

    await queryRunner.createForeignKey(
      'file',
      new TableForeignKey({
        name: 'FK_file_organization',
        columnNames: ['organizationUuid'],
        referencedTableName: 'organization',
        referencedColumnNames: ['uuid'],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      })
    );

    await queryRunner.createIndex(
      'file',
      new TableIndex({
        name: 'IDX_file_org_type_deleted',
        columnNames: ['organizationUuid', 'fileTypeUuid', 'isDeleted']
      })
    );

    await queryRunner.query(`
      INSERT INTO \`file_type\` (\`uuid\`, \`name\`, \`isDeleted\`, \`createdAt\`, \`updatedAt\`)
      VALUES
        ('b2222222-2222-4222-8222-222222222201', 'organization_fiscal_dni', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
        ('b2222222-2222-4222-8222-222222222202', 'organization_fiscal_afip_constancia', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
        ('b2222222-2222-4222-8222-222222222203', 'organization_fiscal_cbu_proof', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
        ('b2222222-2222-4222-8222-222222222204', 'organization_fiscal_iibb', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
        ('b2222222-2222-4222-8222-222222222205', 'organization_fiscal_estatuto', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
        ('b2222222-2222-4222-8222-222222222206', 'organization_fiscal_other', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
      ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`)
    `);

    const hasFiscalTable = await queryRunner.hasTable('organization_fiscal_document');
    if (hasFiscalTable) {
      await queryRunner.query(`
        INSERT INTO \`file\` (
          \`uuid\`, \`userUuid\`, \`organizationUuid\`, \`path\`, \`type\`, \`fileTypeUuid\`,
          \`originalName\`, \`storedName\`, \`sizeBytes\`, \`relativePath\`,
          \`isDeleted\`, \`createdAt\`, \`updatedAt\`, \`createdBy\`, \`updatedBy\`
        )
        SELECT
          d.\`uuid\`,
          NULL,
          d.\`organizationUuid\`,
          NULL,
          d.\`mimeType\`,
          CASE d.\`documentKind\`
            WHEN 'dni' THEN 'b2222222-2222-4222-8222-222222222201'
            WHEN 'afip_constancia' THEN 'b2222222-2222-4222-8222-222222222202'
            WHEN 'cbu_proof' THEN 'b2222222-2222-4222-8222-222222222203'
            WHEN 'iibb' THEN 'b2222222-2222-4222-8222-222222222204'
            WHEN 'estatuto' THEN 'b2222222-2222-4222-8222-222222222205'
            ELSE 'b2222222-2222-4222-8222-222222222206'
          END,
          d.\`originalName\`,
          d.\`storedName\`,
          d.\`sizeBytes\`,
          d.\`relativePath\`,
          d.\`isDeleted\`,
          d.\`createdAt\`,
          d.\`updatedAt\`,
          d.\`createdBy\`,
          d.\`updatedBy\`
        FROM \`organization_fiscal_document\` d
      `);

      await queryRunner.query(`ALTER TABLE \`organization_fiscal_document\` DROP FOREIGN KEY \`FK_org_fiscal_doc_organization\``);
      await queryRunner.query(`DROP INDEX \`IDX_org_fiscal_doc_org\` ON \`organization_fiscal_document\``);
      await queryRunner.dropTable('organization_fiscal_document');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Best-effort reverse: recreate fiscal table empty is enough for schema rollback.
    await queryRunner.query(`
      DELETE FROM \`file\` WHERE \`fileTypeUuid\` IN (
        'b2222222-2222-4222-8222-222222222201',
        'b2222222-2222-4222-8222-222222222202',
        'b2222222-2222-4222-8222-222222222203',
        'b2222222-2222-4222-8222-222222222204',
        'b2222222-2222-4222-8222-222222222205',
        'b2222222-2222-4222-8222-222222222206'
      )
    `);
    await queryRunner.query(`
      DELETE FROM \`file_type\` WHERE \`uuid\` IN (
        'b2222222-2222-4222-8222-222222222201',
        'b2222222-2222-4222-8222-222222222202',
        'b2222222-2222-4222-8222-222222222203',
        'b2222222-2222-4222-8222-222222222204',
        'b2222222-2222-4222-8222-222222222205',
        'b2222222-2222-4222-8222-222222222206'
      )
    `);

    await queryRunner.dropForeignKey('file', 'FK_file_organization');
    await queryRunner.dropIndex('file', 'IDX_file_org_type_deleted');
    await queryRunner.query(`ALTER TABLE \`file\` DROP COLUMN \`relativePath\``);
    await queryRunner.query(`ALTER TABLE \`file\` DROP COLUMN \`sizeBytes\``);
    await queryRunner.query(`ALTER TABLE \`file\` DROP COLUMN \`storedName\``);
    await queryRunner.query(`ALTER TABLE \`file\` DROP COLUMN \`originalName\``);
    await queryRunner.query(`ALTER TABLE \`file\` DROP COLUMN \`organizationUuid\``);

    await queryRunner.dropForeignKey('file', 'FK_file_user');
    await queryRunner.query(`ALTER TABLE \`file\` MODIFY \`userUuid\` varchar(36) NOT NULL`);
    await queryRunner.query(`ALTER TABLE \`file\` MODIFY \`path\` varchar(255) NOT NULL`);
    await queryRunner.createForeignKey(
      'file',
      new TableForeignKey({
        columnNames: ['userUuid'],
        referencedTableName: 'user',
        referencedColumnNames: ['uuid'],
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION'
      })
    );
  }
}
