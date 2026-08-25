import { MigrationInterface, QueryRunner } from 'typeorm';
import { CLIENTE_ROLE_UUID } from './1782604800000-SeedClienteRole';

/**
 * Notificación de prueba para usuarios con rol Cliente (verificar UI /client/notifications).
 * Idempotente: no inserta si ya existe el título de prueba para ese userUuid.
 */
export class SeedClientTestNotifications1783814400000 implements MigrationInterface {
  name = 'SeedClientTestNotifications1783814400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT INTO \`user_notification\` (\`uuid\`, \`userUuid\`, \`title\`, \`body\`, \`readAt\`, \`isDeleted\`, \`createdAt\`, \`updatedAt\`)
      SELECT
        UUID(),
        ur.\`userUuid\`,
        'Bienvenido a tu cuenta',
        'Esta es una notificación de prueba. Cuando haya cambios en eventos o en tu cuenta, van a aparecer acá.',
        NULL,
        NULL,
        CURRENT_TIMESTAMP(3),
        CURRENT_TIMESTAMP(3)
      FROM \`user_role\` ur
      INNER JOIN \`user\` u ON u.\`uuid\` = ur.\`userUuid\` AND u.\`isDeleted\` IS NULL
      WHERE ur.\`roleUuid\` = ?
        AND ur.\`isDeleted\` IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM \`user_notification\` n
          WHERE n.\`userUuid\` = ur.\`userUuid\`
            AND n.\`title\` = 'Bienvenido a tu cuenta'
            AND n.\`isDeleted\` IS NULL
        )
      `,
      [CLIENTE_ROLE_UUID]
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM \`user_notification\` WHERE \`title\` = 'Bienvenido a tu cuenta'`
    );
  }
}
