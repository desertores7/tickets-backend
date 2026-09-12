import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Piso / nivel del sector.
 *
 * Los planos de varias plantas reinician la numeración en cada una, así que el
 * "15" del primer piso y el del segundo son unidades distintas con la misma
 * etiqueta impresa. La identidad de un sector pasa a ser (level, name); sin
 * esta columna el upsert rechazaba el mapa completo por nombres repetidos.
 *
 * Nullable: las salas de un solo nivel siguen guardando null y nada cambia
 * para los mapas ya existentes.
 */
export class EventMapSectorLevel1789200000000 implements MigrationInterface {
  name = 'EventMapSectorLevel1789200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`event_map_sector\`
      ADD COLUMN \`level\` varchar(120) NULL DEFAULT NULL AFTER \`name\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`event_map_sector\` DROP COLUMN \`level\``);
  }
}
