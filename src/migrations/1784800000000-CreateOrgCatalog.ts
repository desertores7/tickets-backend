import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

const uuidPrimaryColumn = {
  name: 'uuid',
  type: 'varchar',
  length: '36',
  isPrimary: true
} as const;

const timestamps = [
  { name: 'isDeleted', type: 'boolean', isNullable: true, default: null },
  { name: 'createdAt', type: 'timestamp', precision: 3, default: 'CURRENT_TIMESTAMP(3)' },
  {
    name: 'updatedAt',
    type: 'timestamp',
    precision: 3,
    default: 'CURRENT_TIMESTAMP(3)',
    onUpdate: 'CURRENT_TIMESTAMP(3)'
  }
];

/** Catálogo de la productora: ítems manuales + copia del catálogo MP (FP11 §3). */
export class CreateOrgCatalog1784800000000 implements MigrationInterface {
  name = 'CreateOrgCatalog1784800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'org_manual_item',
        columns: [
          uuidPrimaryColumn,
          { name: 'organizationUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'name', type: 'varchar', length: '255', isNullable: false },
          { name: 'referencePrice', type: 'decimal', precision: 12, scale: 2, isNullable: true, default: null },
          {
            name: 'category',
            type: 'enum',
            enum: ['bebidas', 'comida', 'merch', 'otro'],
            isNullable: true,
            default: null
          },
          { name: 'active', type: 'boolean', isNullable: false, default: true },
          ...timestamps
        ]
      }),
      true
    );

    await queryRunner.createForeignKey(
      'org_manual_item',
      new TableForeignKey({
        name: 'FK_org_manual_item_organization',
        columnNames: ['organizationUuid'],
        referencedTableName: 'organization',
        referencedColumnNames: ['uuid'],
        onDelete: 'CASCADE'
      })
    );
    await queryRunner.createIndex(
      'org_manual_item',
      new TableIndex({ name: 'IDX_org_manual_item_organization', columnNames: ['organizationUuid'] })
    );

    await queryRunner.createTable(
      new Table({
        name: 'mp_catalog_item',
        columns: [
          uuidPrimaryColumn,
          { name: 'organizationUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'orgMpAccountUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'externalId', type: 'varchar', length: '128', isNullable: false },
          { name: 'name', type: 'varchar', length: '255', isNullable: false },
          { name: 'price', type: 'decimal', precision: 12, scale: 2, isNullable: true, default: null },
          { name: 'lastSyncAt', type: 'timestamp', precision: 3, isNullable: true, default: null },
          ...timestamps
        ]
      }),
      true
    );

    await queryRunner.createForeignKey(
      'mp_catalog_item',
      new TableForeignKey({
        name: 'FK_mp_catalog_item_organization',
        columnNames: ['organizationUuid'],
        referencedTableName: 'organization',
        referencedColumnNames: ['uuid'],
        onDelete: 'CASCADE'
      })
    );
    await queryRunner.createForeignKey(
      'mp_catalog_item',
      new TableForeignKey({
        name: 'FK_mp_catalog_item_account',
        columnNames: ['orgMpAccountUuid'],
        referencedTableName: 'org_mp_account',
        referencedColumnNames: ['uuid'],
        onDelete: 'CASCADE'
      })
    );

    // El sync es idempotente: reimportar el mismo producto actualiza la fila en
    // vez de duplicarla, y el externalId es la clave con la que despues se
    // matchean los movimientos MP.
    await queryRunner.createIndex(
      'mp_catalog_item',
      new TableIndex({
        name: 'UQ_mp_catalog_item_account_external',
        columnNames: ['orgMpAccountUuid', 'externalId'],
        isUnique: true
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('mp_catalog_item', true);
    await queryRunner.dropTable('org_manual_item', true);
  }
}
