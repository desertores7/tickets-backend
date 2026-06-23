import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateCheckInLog1782000000000 implements MigrationInterface {
  name = 'CreateCheckInLog1782000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'check_in_log',
        columns: [
          {
            name: 'uuid',
            type: 'varchar',
            length: '36',
            isPrimary: true
          },
          {
            name: 'ticketUuid',
            type: 'varchar',
            length: '36',
            isNullable: true,
            default: null
          },
          {
            name: 'eventUuid',
            type: 'varchar',
            length: '36',
            isNullable: false
          },
          {
            name: 'scannedBy',
            type: 'varchar',
            length: '36',
            isNullable: false
          },
          {
            name: 'scannedAt',
            type: 'timestamp',
            precision: 3,
            isNullable: false,
            default: 'CURRENT_TIMESTAMP(3)'
          },
          {
            name: 'result',
            type: 'enum',
            enum: ['success', 'already_used', 'invalid', 'wrong_event'],
            isNullable: false
          },
          {
            name: 'deviceInfo',
            type: 'json',
            isNullable: true,
            default: null
          }
        ],
        indices: [
          new TableIndex({ name: 'IDX_check_in_log_ticketUuid', columnNames: ['ticketUuid'] }),
          new TableIndex({ name: 'IDX_check_in_log_eventUuid', columnNames: ['eventUuid'] }),
          new TableIndex({ name: 'IDX_check_in_log_scannedBy', columnNames: ['scannedBy'] }),
          new TableIndex({ name: 'IDX_check_in_log_result', columnNames: ['result'] }),
          new TableIndex({ name: 'IDX_check_in_log_scannedAt', columnNames: ['scannedAt'] })
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['ticketUuid'],
            referencedTableName: 'ticket',
            referencedColumnNames: ['uuid'],
            onDelete: 'NO ACTION',
            onUpdate: 'NO ACTION'
          }),
          new TableForeignKey({
            columnNames: ['eventUuid'],
            referencedTableName: 'event',
            referencedColumnNames: ['uuid'],
            onDelete: 'NO ACTION',
            onUpdate: 'NO ACTION'
          }),
          new TableForeignKey({
            columnNames: ['scannedBy'],
            referencedTableName: 'user',
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
    await queryRunner.dropTable('check_in_log', true);
  }
}
