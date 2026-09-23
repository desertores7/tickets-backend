import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `event_ai_map_run` no tenía forma de saber a qué evento pertenecía cada
 * corrida (solo `userUuid` + `imageHash`, pensados para depurar, no para
 * recuperar por evento). El botón "Reajustar mapa con IA" necesita volver a
 * mandar la imagen + el layout completo (con `box`/pesos, que no sobrevive el
 * guardado del mapa — `event_map.analysis` guarda la versión ya reducida a
 * grilla) de la última corrida OK de ESTE evento, así que hace falta poder
 * buscarla por `eventUuid`.
 *
 * Nullable: las corridas viejas quedan sin evento asociado (el reajuste con
 * IA no está disponible para esos mapas, se reajustan solo localmente).
 */
export class EventAiMapRunEventUuid1790200000000 implements MigrationInterface {
  name = 'EventAiMapRunEventUuid1790200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `event_ai_map_run` ADD `eventUuid` varchar(36) NULL DEFAULT NULL AFTER `userUuid`'
    );
    await queryRunner.query(
      'ALTER TABLE `event_ai_map_run` ADD INDEX `IDX_ai_map_run_event` (`eventUuid`, `status`, `createdAt`)'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `event_ai_map_run` DROP INDEX `IDX_ai_map_run_event`');
    await queryRunner.query('ALTER TABLE `event_ai_map_run` DROP COLUMN `eventUuid`');
  }
}
