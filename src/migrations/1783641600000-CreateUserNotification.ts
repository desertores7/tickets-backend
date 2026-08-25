import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

const uuidPrimaryColumn = {
  name: 'uuid',
  type: 'varchar',
  length: '36',
  isPrimary: true
} as const;

/**
 * Notificaciones in-app del Cliente. Writers automáticos (cancelación de evento, etc.) vienen después.
 */
export class CreateUserNotification1783641600000 implements MigrationInterface {
  name = 'CreateUserNotification1783641600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'user_notification',
        columns: [
          uuidPrimaryColumn,
          { name: 'userUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'title', type: 'varchar', length: '255', isNullable: false },
          { name: 'body', type: 'text', isNullable: false },
          { name: 'readAt', type: 'timestamp', precision: 3, isNullable: true, default: null },
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
          }
        ],
        indices: [
          new TableIndex({
            name: 'IDX_user_notification_userUuid_createdAt',
            columnNames: ['userUuid', 'createdAt']
          })
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['userUuid'],
            referencedTableName: 'user',
            referencedColumnNames: ['uuid'],
            onDelete: 'CASCADE',
            onUpdate: 'NO ACTION'
          })
        ]
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('user_notification', true);
  }
}
