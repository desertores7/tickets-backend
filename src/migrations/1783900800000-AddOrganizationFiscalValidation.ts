import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

/**
 * Datos fiscales privados de la productora + estados de validación (FP01 / BR-PROD-002).
 * Orgs existentes quedan `approved` para no romper eventos ya creados.
 */
export class AddOrganizationFiscalValidation1783900800000 implements MigrationInterface {
  name = 'AddOrganizationFiscalValidation1783900800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'organization',
      new TableColumn({
        name: 'legalName',
        type: 'varchar',
        length: '255',
        isNullable: true,
        default: null
      })
    );
    await queryRunner.addColumn(
      'organization',
      new TableColumn({
        name: 'taxId',
        type: 'varchar',
        length: '20',
        isNullable: true,
        default: null
      })
    );
    await queryRunner.addColumn(
      'organization',
      new TableColumn({
        name: 'taxCondition',
        type: 'enum',
        enum: ['monotributo', 'responsable_inscripto', 'exento'],
        isNullable: true,
        default: null
      })
    );
    await queryRunner.addColumn(
      'organization',
      new TableColumn({
        name: 'contactPhone',
        type: 'varchar',
        length: '50',
        isNullable: true,
        default: null
      })
    );
    await queryRunner.addColumn(
      'organization',
      new TableColumn({
        name: 'contactEmail',
        type: 'varchar',
        length: '255',
        isNullable: true,
        default: null
      })
    );
    await queryRunner.addColumn(
      'organization',
      new TableColumn({
        name: 'verificationReference',
        type: 'varchar',
        length: '500',
        isNullable: true,
        default: null
      })
    );
    await queryRunner.addColumn(
      'organization',
      new TableColumn({
        name: 'bankAccount',
        type: 'varchar',
        length: '100',
        isNullable: true,
        default: null
      })
    );
    await queryRunner.addColumn(
      'organization',
      new TableColumn({
        name: 'validationStatus',
        type: 'enum',
        enum: ['draft_incomplete', 'pending_review', 'approved', 'rejected'],
        isNullable: false,
        default: "'draft_incomplete'"
      })
    );
    await queryRunner.addColumn(
      'organization',
      new TableColumn({
        name: 'rejectionReason',
        type: 'text',
        isNullable: true,
        default: null
      })
    );
    await queryRunner.addColumn(
      'organization',
      new TableColumn({
        name: 'validationSubmittedAt',
        type: 'timestamp',
        precision: 3,
        isNullable: true,
        default: null
      })
    );
    await queryRunner.addColumn(
      'organization',
      new TableColumn({
        name: 'validationResolvedAt',
        type: 'timestamp',
        precision: 3,
        isNullable: true,
        default: null
      })
    );

    await queryRunner.createIndex(
      'organization',
      new TableIndex({
        name: 'IDX_organization_taxId',
        columnNames: ['taxId'],
        isUnique: true
      })
    );

    // Orgs previas: ya operaban sin wizard → aprobadas.
    await queryRunner.query(
      `UPDATE \`organization\` SET \`validationStatus\` = 'approved' WHERE \`isDeleted\` IS NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('organization', 'IDX_organization_taxId');
    await queryRunner.dropColumn('organization', 'validationResolvedAt');
    await queryRunner.dropColumn('organization', 'validationSubmittedAt');
    await queryRunner.dropColumn('organization', 'rejectionReason');
    await queryRunner.dropColumn('organization', 'validationStatus');
    await queryRunner.dropColumn('organization', 'bankAccount');
    await queryRunner.dropColumn('organization', 'verificationReference');
    await queryRunner.dropColumn('organization', 'contactEmail');
    await queryRunner.dropColumn('organization', 'contactPhone');
    await queryRunner.dropColumn('organization', 'taxCondition');
    await queryRunner.dropColumn('organization', 'taxId');
    await queryRunner.dropColumn('organization', 'legalName');
  }
}
