import { MigrationInterface, QueryRunner } from 'typeorm';

const OPERADOR_ROLE_UUID = 'f06dadd4-224c-42f2-878f-84ba153eadc2';
const CLIENTE_ROLE_UUID = 'd4f8a1c3-5b27-4e69-9a04-3c71e8b5d2f6';

/**
 * Elimina el rol "Operador": era herencia del proyecto base y ningún guard,
 * decorador ni consulta lo usaba (la lógica que lo referenciaba estaba comentada).
 *
 * Si algún usuario lo tuviera asignado se lo pasa a "Cliente" para no dejarlo
 * sin rol; recién después se borra el rol (user_role tiene FK contra role).
 */
export class RemoveOperadorRole1782691200000 implements MigrationInterface {
  name = 'RemoveOperadorRole1782691200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Reasignar a Cliente a quienes tuvieran Operador y ningún otro rol activo
    await queryRunner.query(
      `
      UPDATE \`user_role\`
      SET \`roleUuid\` = ?, \`updatedAt\` = CURRENT_TIMESTAMP(3)
      WHERE \`roleUuid\` = ?
        AND \`isDeleted\` IS NULL
        AND \`userUuid\` NOT IN (
          SELECT * FROM (
            SELECT \`userUuid\` FROM \`user_role\`
            WHERE \`roleUuid\` = ? AND \`isDeleted\` IS NULL
          ) AS existing_cliente
        )
      `,
      [CLIENTE_ROLE_UUID, OPERADOR_ROLE_UUID, CLIENTE_ROLE_UUID]
    );

    // El resto (los que ya tenían Cliente) se eliminan
    await queryRunner.query(`DELETE FROM \`user_role\` WHERE \`roleUuid\` = ?`, [OPERADOR_ROLE_UUID]);

    await queryRunner.query(`DELETE FROM \`role\` WHERE \`uuid\` = ?`, [OPERADOR_ROLE_UUID]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Se recrea el rol vacío; las asignaciones originales no se pueden restituir
    await queryRunner.query(
      `
      INSERT INTO \`role\` (\`uuid\`, \`name\`, \`isDeleted\`, \`createdAt\`, \`updatedAt\`, \`createdBy\`, \`updatedBy\`)
      VALUES (?, 'Operador', NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL, NULL)
      ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`)
      `,
      [OPERADOR_ROLE_UUID]
    );
  }
}
