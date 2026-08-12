import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

const uuidPrimaryColumn = {
  name: 'uuid',
  type: 'varchar',
  length: '36',
  isPrimary: true
} as const;

/**
 * Transferencias de entradas con confirmación del destinatario.
 * Reemplaza el esquema anterior (transferredToEmail/transferredAt en `ticket`),
 * que marcaba la transferencia sin que la otra parte tuviera que aceptarla.
 */
export class CreateTicketTransfer1782950400000 implements MigrationInterface {
  name = 'CreateTicketTransfer1782950400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'ticket_transfer',
        columns: [
          uuidPrimaryColumn,
          { name: 'ticketUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'fromUserUuid', type: 'varchar', length: '36', isNullable: false },
          { name: 'toEmail', type: 'varchar', length: '255', isNullable: false },
          { name: 'toUserUuid', type: 'varchar', length: '36', isNullable: true, default: null },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'accepted', 'rejected', 'cancelled'],
            isNullable: false,
            default: "'pending'"
          },
          { name: 'message', type: 'varchar', length: '280', isNullable: true, default: null },
          { name: 'respondedAt', type: 'timestamp', precision: 3, isNullable: true, default: null },
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
          new TableIndex({ name: 'IDX_ticket_transfer_ticketUuid', columnNames: ['ticketUuid'] }),
          // El destinatario consulta sus pendientes por email
          new TableIndex({ name: 'IDX_ticket_transfer_toEmail_status', columnNames: ['toEmail', 'status'] }),
          new TableIndex({ name: 'IDX_ticket_transfer_fromUserUuid', columnNames: ['fromUserUuid'] })
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['ticketUuid'],
            referencedTableName: 'ticket',
            referencedColumnNames: ['uuid'],
            onDelete: 'CASCADE',
            onUpdate: 'NO ACTION'
          }),
          new TableForeignKey({
            columnNames: ['fromUserUuid'],
            referencedTableName: 'user',
            referencedColumnNames: ['uuid'],
            onDelete: 'NO ACTION',
            onUpdate: 'NO ACTION'
          })
        ]
      }),
      true
    );

    // El esquema viejo marcaba la transferencia sin confirmación: se descarta
    await queryRunner.query(
      `UPDATE \`ticket\` SET \`status\` = 'active' WHERE \`status\` = 'transferred'`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('ticket_transfer', true);
  }
}
