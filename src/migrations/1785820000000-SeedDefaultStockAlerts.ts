import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Alertas de stock por defecto (BR-EVENT-017): sin UI Productor.
 * Una alerta activa por tanda — 20% "queda poco" + aviso de agotado.
 */
export class SeedDefaultStockAlerts1785820000000 implements MigrationInterface {
  name = 'SeedDefaultStockAlerts1785820000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO \`stock_alert\` (
        \`uuid\`,
        \`eventUuid\`,
        \`ticketTypeUuid\`,
        \`lowThreshold\`,
        \`thresholdIsPercent\`,
        \`notifySoldOut\`,
        \`active\`,
        \`lowNotifiedAt\`,
        \`soldOutNotifiedAt\`,
        \`isDeleted\`,
        \`createdAt\`,
        \`updatedAt\`
      )
      SELECT
        UUID(),
        tt.\`eventUuid\`,
        tt.\`uuid\`,
        20,
        1,
        1,
        1,
        NULL,
        NULL,
        NULL,
        CURRENT_TIMESTAMP(3),
        CURRENT_TIMESTAMP(3)
      FROM \`ticket_type\` tt
      LEFT JOIN \`stock_alert\` sa ON sa.\`ticketTypeUuid\` = tt.\`uuid\`
      WHERE sa.\`uuid\` IS NULL
        AND tt.\`isActive\` = 1
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM \`stock_alert\`
      WHERE \`thresholdIsPercent\` = 1
        AND \`lowThreshold\` = 20
        AND \`notifySoldOut\` = 1
        AND \`lowNotifiedAt\` IS NULL
        AND \`soldOutNotifiedAt\` IS NULL
    `);
  }
}
