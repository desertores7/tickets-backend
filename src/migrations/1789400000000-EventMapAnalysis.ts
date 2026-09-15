import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Layout abstracto de la IA (AnalyzeMapResult) en el mapa.
 *
 * El editor pinta con MapGridOverlay desde este JSON; sin él solo quedan las
 * geometrías de sector y el checkout/reload reconstruyen un layout distinto.
 * Nullable: mapas a mano o previos siguen sin análisis.
 */
export class EventMapAnalysis1789400000000 implements MigrationInterface {
  name = 'EventMapAnalysis1789400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`event_map\`
      ADD COLUMN \`analysis\` json NULL DEFAULT NULL AFTER \`canvasHeight\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`event_map\` DROP COLUMN \`analysis\``);
  }
}
