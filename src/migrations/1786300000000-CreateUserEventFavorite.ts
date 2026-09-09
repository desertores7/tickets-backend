import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex, TableUnique } from 'typeorm';

const uuidPrimaryColumn = {
  name: 'uuid',
  type: 'varchar',
  length: '36',
  isPrimary: true
} as const;

/**
 * Eventos guardados (favoritos) del Cliente.
 */
export class CreateUserEventFavorite1786300000000 implements MigrationInterface {
  name = 'CreateUserEventFavorite1786300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'user_event_favorite',
        columns: [
          uuidPrimaryColumn,
          { name: 'userUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'eventUuid', type: 'varchar', length: '36', isNullable: false },
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
        uniques: [
          new TableUnique({
            name: 'UQ_user_event_favorite_user_event',
            columnNames: ['userUuid', 'eventUuid']
          })
        ],
        indices: [
          new TableIndex({
            name: 'IDX_user_event_favorite_userUuid_createdAt',
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
          }),
          new TableForeignKey({
            columnNames: ['eventUuid'],
            referencedTableName: 'event',
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
    await queryRunner.dropTable('user_event_favorite', true);
  }
}
