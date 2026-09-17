import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Categoría comercial del sector ("Mesa VIP Callao", "Campo general").
 *
 * Lo que se guarda en `event_map_sector` son las UNIDADES del plano, y sus
 * nombres son la numeración impresa: cuatro sectores de mesas distintos
 * guardan, los cuatro, unidades llamadas "1".."10". Hasta ahora la categoría se
 * reconstruía en el frontend buscando el nombre de la unidad dentro del
 * análisis de la IA, y con nombres repetidos ese match caía siempre en el
 * primer grupo: las cuatro categorías de mesas terminaban listadas en Entradas
 * como una sola, con las tandas de las otras tres desaparecidas.
 *
 * La categoría es un dato del sector, no algo deducible de su nombre.
 *
 * Nullable: los mapas ya guardados siguen sin valor y el frontend cae al
 * método viejo hasta que se vuelvan a guardar.
 */
export class EventMapSectorFamilyLabel1789800000000 implements MigrationInterface {
  name = 'EventMapSectorFamilyLabel1789800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`event_map_sector\`
      ADD COLUMN \`familyLabel\` varchar(160) NULL DEFAULT NULL AFTER \`level\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`event_map_sector\` DROP COLUMN \`familyLabel\``);
  }
}
