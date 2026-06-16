import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

const auditColumns = [
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
] as const;

const softDeleteColumn = { name: 'isDeleted', type: 'date', isNullable: true, default: null } as const;

const uuidPrimaryColumn = {
  name: 'uuid',
  type: 'varchar',
  length: '36',
  isPrimary: true
} as const;

export class InitialSchema1781635200000 implements MigrationInterface {
  name = 'InitialSchema1781635200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'user',
        columns: [
          uuidPrimaryColumn,
          { name: 'dni', type: 'varchar', length: '30', isNullable: true, default: null },
          { name: 'firstName', type: 'varchar', length: '255', isNullable: false },
          { name: 'lastName', type: 'varchar', length: '255', isNullable: false },
          { name: 'email', type: 'varchar', length: '50', isNullable: false },
          { name: 'phone', type: 'varchar', length: '50', isNullable: true, default: null },
          { name: 'username', type: 'varchar', length: '100', isNullable: true },
          { name: 'gender', type: 'varchar', length: '50', isNullable: true, default: null },
          { name: 'password', type: 'varchar', length: '255', isNullable: false },
          { name: 'birthday', type: 'date', isNullable: true, default: null },
          { name: 'active', type: 'int', isNullable: false },
          { name: 'emailVerified', type: 'tinyint', width: 1, isNullable: false, default: 0 },
          { name: 'emailVerifiedAt', type: 'timestamp', isNullable: true, default: null },
          softDeleteColumn,
          ...auditColumns
        ],
        indices: [new TableIndex({ name: 'IDX_user_email', columnNames: ['email'] })]
      }),
      true
    );

    await queryRunner.createTable(
      new Table({
        name: 'role',
        columns: [uuidPrimaryColumn, { name: 'name', type: 'varchar', length: '255', isNullable: false }, softDeleteColumn, ...auditColumns]
      }),
      true
    );

    await queryRunner.createTable(
      new Table({
        name: 'file_type',
        columns: [
          uuidPrimaryColumn,
          { name: 'name', type: 'varchar', length: '50', isNullable: false },
          softDeleteColumn,
          ...auditColumns
        ]
      }),
      true
    );

    await queryRunner.createTable(
      new Table({
        name: 'organization',
        columns: [
          uuidPrimaryColumn,
          { name: 'name', type: 'varchar', length: '255', isNullable: false },
          { name: 'active', type: 'int', isNullable: false, default: 1 },
          softDeleteColumn,
          ...auditColumns
        ]
      }),
      true
    );

    await queryRunner.createTable(
      new Table({
        name: 'email',
        columns: [
          uuidPrimaryColumn,
          { name: 'name', type: 'varchar', length: '45', isNullable: false },
          { name: 'host', type: 'varchar', length: '45', isNullable: false },
          { name: 'port', type: 'varchar', length: '45', isNullable: false },
          { name: 'user', type: 'varchar', length: '45', isNullable: false },
          { name: 'password', type: 'varchar', length: '45', isNullable: false },
          softDeleteColumn,
          { name: 'createdAt', type: 'date', isNullable: true },
          { name: 'updatedAt', type: 'date', isNullable: true },
          { name: 'createdBy', type: 'varchar', length: '45', isNullable: true, default: null },
          { name: 'updatedBy', type: 'varchar', length: '45', isNullable: true, default: null }
        ]
      }),
      true
    );

    await queryRunner.createTable(
      new Table({
        name: 'system_parameter',
        columns: [
          uuidPrimaryColumn,
          { name: 'key', type: 'varchar', length: '255', isNullable: false, isUnique: true },
          { name: 'value', type: 'text', isNullable: false },
          { name: 'description', type: 'varchar', length: '500', isNullable: true },
          { name: 'type', type: 'varchar', length: '50', isNullable: false, default: "'string'" },
          softDeleteColumn,
          ...auditColumns
        ]
      }),
      true
    );

    await queryRunner.createTable(
      new Table({
        name: 'user_role',
        columns: [
          uuidPrimaryColumn,
          { name: 'userUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'roleUuid', type: 'varchar', length: '36', isNullable: false },
          softDeleteColumn,
          ...auditColumns
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['userUuid'],
            referencedTableName: 'user',
            referencedColumnNames: ['uuid'],
            onDelete: 'NO ACTION',
            onUpdate: 'NO ACTION'
          }),
          new TableForeignKey({
            columnNames: ['roleUuid'],
            referencedTableName: 'role',
            referencedColumnNames: ['uuid'],
            onDelete: 'NO ACTION',
            onUpdate: 'NO ACTION'
          })
        ]
      }),
      true
    );

    await queryRunner.createTable(
      new Table({
        name: 'user_organization',
        columns: [
          uuidPrimaryColumn,
          { name: 'userUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'organizationUuid', type: 'varchar', length: '36', isNullable: false },
          softDeleteColumn,
          ...auditColumns
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['userUuid'],
            referencedTableName: 'user',
            referencedColumnNames: ['uuid'],
            onDelete: 'NO ACTION',
            onUpdate: 'NO ACTION'
          }),
          new TableForeignKey({
            columnNames: ['organizationUuid'],
            referencedTableName: 'organization',
            referencedColumnNames: ['uuid'],
            onDelete: 'NO ACTION',
            onUpdate: 'NO ACTION'
          })
        ]
      }),
      true
    );

    await queryRunner.createTable(
      new Table({
        name: 'user_token_session',
        columns: [
          uuidPrimaryColumn,
          { name: 'userUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'access_token', type: 'text', isNullable: false },
          { name: 'refresh_token', type: 'text', isNullable: false },
          softDeleteColumn,
          ...auditColumns
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['userUuid'],
            referencedTableName: 'user',
            referencedColumnNames: ['uuid'],
            onDelete: 'NO ACTION',
            onUpdate: 'NO ACTION'
          })
        ]
      }),
      true
    );

    await queryRunner.createTable(
      new Table({
        name: 'user_session',
        columns: [
          uuidPrimaryColumn,
          { name: 'userUuid', type: 'varchar', length: '36', isNullable: true, default: null },
          { name: 'code', type: 'varchar', length: '6', isNullable: false },
          { name: 'isUsed', type: 'tinyint', width: 1, isNullable: false, default: 0 },
          { name: 'expiresAt', type: 'timestamp', isNullable: false },
          {
            name: 'createdAt',
            type: 'timestamp',
            precision: 3,
            isNullable: true,
            default: 'CURRENT_TIMESTAMP(3)'
          }
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['userUuid'],
            referencedTableName: 'user',
            referencedColumnNames: ['uuid'],
            onDelete: 'NO ACTION',
            onUpdate: 'NO ACTION'
          })
        ]
      }),
      true
    );

    await queryRunner.createTable(
      new Table({
        name: 'user_password_reset',
        columns: [
          uuidPrimaryColumn,
          { name: 'code', type: 'varchar', length: '6', isNullable: false, isUnique: true },
          { name: 'email', type: 'varchar', length: '255', isNullable: false },
          { name: 'isUsed', type: 'tinyint', width: 1, isNullable: false, default: 0 },
          { name: 'expiresAt', type: 'timestamp', isNullable: false },
          { name: 'ipAddress', type: 'varchar', length: '45', isNullable: true },
          { name: 'userAgent', type: 'varchar', length: '500', isNullable: true },
          ...auditColumns
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['email'],
            referencedTableName: 'user',
            referencedColumnNames: ['email'],
            onDelete: 'NO ACTION',
            onUpdate: 'NO ACTION'
          })
        ]
      }),
      true
    );

    await queryRunner.createTable(
      new Table({
        name: 'file',
        columns: [
          uuidPrimaryColumn,
          { name: 'userUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'path', type: 'varchar', length: '255', isNullable: false },
          { name: 'type', type: 'varchar', length: '255', isNullable: false },
          { name: 'fileTypeUuid', type: 'varchar', length: '36', isNullable: false },
          softDeleteColumn,
          ...auditColumns
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['userUuid'],
            referencedTableName: 'user',
            referencedColumnNames: ['uuid'],
            onDelete: 'NO ACTION',
            onUpdate: 'NO ACTION'
          }),
          new TableForeignKey({
            columnNames: ['fileTypeUuid'],
            referencedTableName: 'file_type',
            referencedColumnNames: ['uuid'],
            onDelete: 'NO ACTION',
            onUpdate: 'NO ACTION'
          })
        ]
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('file', true);
    await queryRunner.dropTable('user_password_reset', true);
    await queryRunner.dropTable('user_session', true);
    await queryRunner.dropTable('user_token_session', true);
    await queryRunner.dropTable('user_organization', true);
    await queryRunner.dropTable('user_role', true);
    await queryRunner.dropTable('system_parameter', true);
    await queryRunner.dropTable('email', true);
    await queryRunner.dropTable('organization', true);
    await queryRunner.dropTable('file_type', true);
    await queryRunner.dropTable('role', true);
    await queryRunner.dropTable('user', true);
  }
}
