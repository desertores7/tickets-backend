import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

/**
 * Bandeja de consultas de soporte (`BR-SUPPORT-003`, `33` §16).
 *
 * Hasta acá el formulario de contacto solo mandaba un email: si ese email se
 * perdía, la consulta se perdía con él. Era el único punto del backoffice
 * donde entraba información y no quedaba registro.
 *
 * El email se sigue enviando — es el canal de trabajo real (`BR-SUPPORT-002`).
 * Esta tabla es la constancia: qué entró, en qué quedó y qué anotó el equipo.
 *
 * `userUuid` es opcional porque el formulario es público: se puede escribir sin
 * tener cuenta. Cuando hay sesión se guarda, y con eso el Admin ve a quién
 * pertenece la consulta sin depender de que el email coincida.
 */
export class CreateSupportRequest1786200000000 implements MigrationInterface {
  name = 'CreateSupportRequest1786200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'support_request',
        columns: [
          { name: 'uuid', type: 'varchar', length: '36', isPrimary: true },
          {
            name: 'type',
            type: 'enum',
            enum: ['problema_compra', 'no_recibi_entrada', 'consulta_evento', 'otro'],
            isNullable: false
          },
          { name: 'message', type: 'varchar', length: '2000', isNullable: false },
          // Email de contacto que dejó quien escribe. No tiene por qué ser el
          // de su cuenta: es a dónde hay que responderle.
          { name: 'email', type: 'varchar', length: '255', isNullable: false },
          // Null cuando escribió sin sesión iniciada.
          { name: 'userUuid', type: 'varchar', length: '36', isNullable: true, default: null },
          {
            name: 'status',
            type: 'enum',
            enum: ['new', 'in_progress', 'resolved'],
            default: "'new'",
            isNullable: false
          },
          // Notas del equipo. No se le muestran a quien escribió.
          { name: 'internalNotes', type: 'varchar', length: '2000', isNullable: true, default: null },
          // Quién la cerró, para poder preguntarle.
          { name: 'resolvedBy', type: 'varchar', length: '36', isNullable: true, default: null },
          { name: 'resolvedAt', type: 'timestamp', precision: 3, isNullable: true, default: null },
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

    // SET NULL y no CASCADE: si el usuario da de baja su cuenta, la consulta y
    // lo que el equipo anotó sobre ella siguen existiendo.
    await queryRunner.createForeignKey(
      'support_request',
      new TableForeignKey({
        name: 'FK_support_request_userUuid',
        columnNames: ['userUuid'],
        referencedTableName: 'user',
        referencedColumnNames: ['uuid'],
        onDelete: 'SET NULL'
      })
    );

    await queryRunner.createForeignKey(
      'support_request',
      new TableForeignKey({
        name: 'FK_support_request_resolvedBy',
        columnNames: ['resolvedBy'],
        referencedTableName: 'user',
        referencedColumnNames: ['uuid'],
        onDelete: 'SET NULL'
      })
    );

    // La bandeja se abre siempre igual: lo sin atender primero, lo más nuevo arriba.
    await queryRunner.createIndex(
      'support_request',
      new TableIndex({ name: 'IDX_support_request_bandeja', columnNames: ['status', 'createdAt'] })
    );

    // "Todo lo que escribió esta persona", desde su ficha.
    await queryRunner.createIndex(
      'support_request',
      new TableIndex({ name: 'IDX_support_request_user', columnNames: ['userUuid', 'createdAt'] })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('support_request', true);
  }
}
