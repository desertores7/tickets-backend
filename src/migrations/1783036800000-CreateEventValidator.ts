import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

const uuidPrimaryColumn = {
  name: 'uuid',
  type: 'varchar',
  length: '36',
  isPrimary: true
} as const;

/**
 * Personal de puerta por evento. Mismo patrón que event_producer, pero sin
 * vínculo con la organización: un validador trabaja la puerta, no el backoffice.
 */
export class CreateEventValidator1783036800000 implements MigrationInterface {
  name = 'CreateEventValidator1783036800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'event_validator',
        columns: [
          uuidPrimaryColumn,
          { name: 'eventUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'userUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'assignedBy', type: 'varchar', length: '36', isNullable: true, default: null },
          {
            name: 'createdAt',
            type: 'timestamp',
            precision: 3,
            isNullable: true,
            default: 'CURRENT_TIMESTAMP(3)'
          }
        ],
        indices: [
          // Evita asignar dos veces al mismo validador en el mismo evento
          new TableIndex({
            name: 'IDX_event_validator_event_user',
            columnNames: ['eventUuid', 'userUuid'],
            isUnique: true
          }),
          new TableIndex({ name: 'IDX_event_validator_userUuid', columnNames: ['userUuid'] })
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['eventUuid'],
            referencedTableName: 'event',
            referencedColumnNames: ['uuid'],
            onDelete: 'CASCADE',
            onUpdate: 'NO ACTION'
          }),
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
    await queryRunner.dropTable('event_validator', true);
  }
}
