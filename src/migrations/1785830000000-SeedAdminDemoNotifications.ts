import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Notificaciones demo (mezcla leídas / no leídas) para probar la UI del listado.
 * Usuario: 273715f3-3c19-42f7-afb3-e5fa4513b28c
 * Idempotente por uuid fijo.
 */
const TARGET_USER_UUID = '273715f3-3c19-42f7-afb3-e5fa4513b28c';

const SEED_ROWS: Array<{
  uuid: string;
  title: string;
  body: string;
  readAt: string | null;
  minutesAgo: number;
}> = [
  {
    uuid: '91c0ffe1-2a3b-4c5d-8e9f-273715f30001',
    title: '¡Tu evento es mañana!',
    body: 'Recordá llevar tu entrada digital. El check-in abre 1 hora antes.',
    readAt: null,
    minutesAgo: 15
  },
  {
    uuid: '91c0ffe1-2a3b-4c5d-8e9f-273715f30002',
    title: '¡Pago confirmado!',
    body: '$12.500 ya acreditan tu compra. Revisá tus entradas en la sección Entradas.',
    readAt: null,
    minutesAgo: 45
  },
  {
    uuid: '91c0ffe1-2a3b-4c5d-8e9f-273715f30003',
    title: 'Te transfirieron una entrada',
    body: 'Juan Pérez te envió una entrada para Fiesta Neon. Abrí Entradas para verla.',
    readAt: 'DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 1 DAY)',
    minutesAgo: 60 * 24
  },
  {
    uuid: '91c0ffe1-2a3b-4c5d-8e9f-273715f30004',
    title: 'Entrada lista',
    body: 'Tu PDF y QR de Noche Electrónica ya están disponibles para descargar.',
    readAt: 'DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 2 DAY)',
    minutesAgo: 60 * 48
  }
];

export class SeedAdminDemoNotifications1785830000000 implements MigrationInterface {
  name = 'SeedAdminDemoNotifications1785830000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const row of SEED_ROWS) {
      const readAtSql = row.readAt === null ? 'NULL' : row.readAt;
      await queryRunner.query(
        `
        INSERT INTO \`user_notification\`
          (\`uuid\`, \`userUuid\`, \`title\`, \`body\`, \`readAt\`, \`isDeleted\`, \`createdAt\`, \`updatedAt\`)
        SELECT
          ?,
          ?,
          ?,
          ?,
          ${readAtSql},
          NULL,
          DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL ? MINUTE),
          CURRENT_TIMESTAMP(3)
        FROM DUAL
        WHERE EXISTS (
          SELECT 1 FROM \`user\` u
          WHERE u.\`uuid\` = ? AND u.\`isDeleted\` IS NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM \`user_notification\` n
          WHERE n.\`uuid\` = ? AND n.\`isDeleted\` IS NULL
        )
        `,
        [row.uuid, TARGET_USER_UUID, row.title, row.body, row.minutesAgo, TARGET_USER_UUID, row.uuid]
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      DELETE FROM \`user_notification\`
      WHERE \`uuid\` IN (?, ?, ?, ?)
      `,
      SEED_ROWS.map(r => r.uuid)
    );
  }
}
