import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

const uuidPrimaryColumn = {
  name: 'uuid',
  type: 'varchar',
  length: '36',
  isPrimary: true
} as const;

/** Cuentas de Mercado Pago propias de la productora (FP11 §2 / BR-CASH-001). */
export class CreateOrgMpAccount1784700000000 implements MigrationInterface {
  name = 'CreateOrgMpAccount1784700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'org_mp_account',
        columns: [
          uuidPrimaryColumn,
          { name: 'organizationUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'alias', type: 'varchar', length: '120', isNullable: false },
          { name: 'mpUserId', type: 'varchar', length: '64', isNullable: false },
          { name: 'mpEmail', type: 'varchar', length: '255', isNullable: true, default: null },
          // Los tokens van cifrados (AES-256-GCM), por eso `text` y no varchar:
          // el ciphertext en base64 mas el IV y el authTag no entran en 255.
          { name: 'accessTokenEncrypted', type: 'text', isNullable: false },
          { name: 'refreshTokenEncrypted', type: 'text', isNullable: true, default: null },
          { name: 'tokenExpiresAt', type: 'timestamp', precision: 3, isNullable: true, default: null },
          { name: 'liveMode', type: 'boolean', isNullable: false, default: true },
          {
            name: 'status',
            type: 'enum',
            enum: ['connected', 'disconnected', 'error'],
            isNullable: false,
            default: "'connected'"
          },
          { name: 'lastCatalogSyncAt', type: 'timestamp', precision: 3, isNullable: true, default: null },
          { name: 'lastErrorMessage', type: 'varchar', length: '500', isNullable: true, default: null },
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
      'org_mp_account',
      new TableForeignKey({
        name: 'FK_org_mp_account_organization',
        columnNames: ['organizationUuid'],
        referencedTableName: 'organization',
        referencedColumnNames: ['uuid'],
        onDelete: 'CASCADE'
      })
    );

    await queryRunner.createIndex(
      'org_mp_account',
      new TableIndex({ name: 'IDX_org_mp_account_organization', columnNames: ['organizationUuid'] })
    );

    // Una misma cuenta de MP no puede conectarse dos veces a la misma
    // productora: al reconectar se reutiliza la fila y se rotan los tokens.
    await queryRunner.createIndex(
      'org_mp_account',
      new TableIndex({
        name: 'UQ_org_mp_account_org_mpuser',
        columnNames: ['organizationUuid', 'mpUserId'],
        isUnique: true
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('org_mp_account', true);
  }
}
