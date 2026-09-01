import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

/** Liquidaciones a productoras (FP03 §8 / BR-PAY-005 / BR-REPORT-003). */
export class CreatePayout1784900000000 implements MigrationInterface {
  name = 'CreatePayout1784900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // `file.fileTypeUuid` tiene FK a `file_type`: los tipos deben existir
    // antes de poder adjuntar comprobantes o facturas.
    await queryRunner.query(
      'INSERT INTO file_type (uuid, name) VALUES (?, ?), (?, ?) ' +
        'ON DUPLICATE KEY UPDATE name = VALUES(name)',
      [
        'c3333333-3333-4333-8333-333333333301',
        'payout_transfer_proof',
        'c3333333-3333-4333-8333-333333333302',
        'payout_arca_invoice'
      ]
    );

    await queryRunner.createTable(
      new Table({
        name: 'payout',
        columns: [
          { name: 'uuid', type: 'varchar', length: '36', isPrimary: true },
          { name: 'organizationUuid', type: 'varchar', length: '36', isNullable: false },
          // Sin unique: un mismo evento puede tener N liquidaciones (BR-PAY-005).
          { name: 'eventUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'amount', type: 'decimal', precision: 14, scale: 2, isNullable: false },
          { name: 'transferredAt', type: 'timestamp', precision: 3, isNullable: false },
          { name: 'notes', type: 'text', isNullable: true, default: null },
          {
            name: 'status',
            type: 'enum',
            enum: ['registered', 'invoice_pending', 'invoice_available'],
            isNullable: false,
            default: "'registered'"
          },
          { name: 'transferProofFileUuid', type: 'varchar', length: '36', isNullable: true, default: null },
          { name: 'arcaInvoiceFileUuid', type: 'varchar', length: '36', isNullable: true, default: null },
          { name: 'createdBy', type: 'varchar', length: '36', isNullable: true, default: null },
          { name: 'isDeleted', type: 'boolean', isNullable: true, default: null },
          { name: 'createdAt', type: 'timestamp', precision: 3, default: 'CURRENT_TIMESTAMP(3)' },
          {
            name: 'updatedAt',
            type: 'timestamp',
            precision: 3,
            default: 'CURRENT_TIMESTAMP(3)',
            onUpdate: 'CURRENT_TIMESTAMP(3)'
          }
        ]
      }),
      true
    );

    await queryRunner.createForeignKey(
      'payout',
      new TableForeignKey({
        name: 'FK_payout_organization',
        columnNames: ['organizationUuid'],
        referencedTableName: 'organization',
        referencedColumnNames: ['uuid'],
        onDelete: 'CASCADE'
      })
    );

    await queryRunner.createForeignKey(
      'payout',
      new TableForeignKey({
        name: 'FK_payout_event',
        columnNames: ['eventUuid'],
        referencedTableName: 'event',
        referencedColumnNames: ['uuid'],
        onDelete: 'RESTRICT'
      })
    );

    // La vista del productor agrupa por evento: se consulta siempre por org
    // y se ordena por fecha de transferencia.
    await queryRunner.createIndex(
      'payout',
      new TableIndex({
        name: 'IDX_payout_org_transferred',
        columnNames: ['organizationUuid', 'transferredAt']
      })
    );
    await queryRunner.createIndex(
      'payout',
      new TableIndex({ name: 'IDX_payout_event', columnNames: ['eventUuid'] })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('payout', true);
  }
}
