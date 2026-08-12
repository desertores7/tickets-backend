import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

const uuidPrimaryColumn = {
  name: 'uuid',
  type: 'varchar',
  length: '36',
  isPrimary: true
} as const;

/**
 * Asignación de productores a eventos puntuales. Aditiva al acceso por
 * organización (user_organization): un productor entra por cualquiera de las dos.
 */
export class CreateEventProducer1782518400000 implements MigrationInterface {
  name = 'CreateEventProducer1782518400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'event_producer',
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
          // Evita asignar dos veces al mismo productor en el mismo evento
          new TableIndex({
            name: 'IDX_event_producer_event_user',
            columnNames: ['eventUuid', 'userUuid'],
            isUnique: true
          }),
          new TableIndex({ name: 'IDX_event_producer_userUuid', columnNames: ['userUuid'] })
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
    await queryRunner.dropTable('event_producer', true);
  }
}
