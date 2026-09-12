import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Registro de cada análisis de mapa con IA.
 *
 * Guarda la respuesta cruda de OpenAI y la normalizada. Sirve para tres cosas
 * que hoy eran imposibles: depurar un mapa que salió mal sin pedirle al
 * productor que lo reproduzca, correr un prompt nuevo contra casos viejos para
 * ver si mejoró, y sacar de acá los fixtures del normalizador.
 *
 * Volumen esperado: unidades por día. No hay que podarla.
 */
export class EventAiMapRun1789200100000 implements MigrationInterface {
  name = 'EventAiMapRun1789200100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`event_ai_map_run\` (
        \`uuid\` varchar(36) NOT NULL,
        \`userUuid\` varchar(36) NULL DEFAULT NULL,
        \`imageHash\` varchar(64) NOT NULL,
        \`imageName\` varchar(255) NULL DEFAULT NULL,
        \`imageBytes\` int NULL DEFAULT NULL,
        \`model\` varchar(120) NOT NULL,
        \`reasoningEffort\` varchar(20) NULL DEFAULT NULL,
        \`status\` varchar(20) NOT NULL,
        \`latencyMs\` int NULL DEFAULT NULL,
        \`openaiMs\` int NULL DEFAULT NULL,
        \`promptTokens\` int NULL DEFAULT NULL,
        \`completionTokens\` int NULL DEFAULT NULL,
        \`groupCount\` int NULL DEFAULT NULL,
        \`labelCount\` int NULL DEFAULT NULL,
        \`warningCount\` int NOT NULL DEFAULT 0,
        \`rawResponse\` longtext NULL DEFAULT NULL,
        \`normalizedResult\` longtext NULL DEFAULT NULL,
        \`warnings\` json NULL DEFAULT NULL,
        \`errorMessage\` varchar(1000) NULL DEFAULT NULL,
        \`createdAt\` timestamp(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`uuid\`),
        KEY \`IDX_ai_map_run_hash\` (\`imageHash\`),
        KEY \`IDX_ai_map_run_created\` (\`createdAt\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`event_ai_map_run\``);
  }
}
