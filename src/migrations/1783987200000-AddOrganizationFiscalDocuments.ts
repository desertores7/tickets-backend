import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

/**
 * Documentación fiscal privada de productoras (BR-PROD-002 / BR-PROD-012).
 * Archivos en disco bajo storage/private/... (no servidos por /static).
 */
export class AddOrganizationFiscalDocuments1783987200000 implements MigrationInterface {
  name = 'AddOrganizationFiscalDocuments1783987200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'organization_fiscal_document',
        columns: [
          { name: 'uuid', type: 'varchar', length: '36', isPrimary: true },
          { name: 'organizationUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'originalName', type: 'varchar', length: '255', isNullable: false },
          { name: 'storedName', type: 'varchar', length: '100', isNullable: false },
          { name: 'mimeType', type: 'varchar', length: '100', isNullable: false },
          { name: 'sizeBytes', type: 'int', isNullable: false },
          { name: 'relativePath', type: 'varchar', length: '500', isNullable: false },
          {
            name: 'documentKind',
            type: 'enum',
            enum: ['dni', 'afip_constancia', 'cbu_proof', 'iibb', 'estatuto', 'other'],
            isNullable: false
          },
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

    await queryRunner.createIndex(
      'organization_fiscal_document',
      new TableIndex({
        name: 'IDX_org_fiscal_doc_org',
        columnNames: ['organizationUuid']
      })
    );

    await queryRunner.createForeignKey(
      'organization_fiscal_document',
      new TableForeignKey({
        name: 'FK_org_fiscal_doc_organization',
        columnNames: ['organizationUuid'],
        referencedTableName: 'organization',
        referencedColumnNames: ['uuid'],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey('organization_fiscal_document', 'FK_org_fiscal_doc_organization');
    await queryRunner.dropIndex('organization_fiscal_document', 'IDX_org_fiscal_doc_org');
    await queryRunner.dropTable('organization_fiscal_document');
  }
}
