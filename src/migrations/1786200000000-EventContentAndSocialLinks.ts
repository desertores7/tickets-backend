import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Detalle + Ubicación y Redes del editor:
 * - `content`: HTML de “Sobre el evento” (distinto de `description` corta)
 * - `socialLinks`: json [{ network, url, label }]
 */
export class EventContentAndSocialLinks1786200000000 implements MigrationInterface {
  name = 'EventContentAndSocialLinks1786200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('event', 'content'))) {
      await queryRunner.query(`
        ALTER TABLE \`event\`
        ADD COLUMN \`content\` text NULL DEFAULT NULL
        AFTER \`description\`
      `);
    }
    if (!(await queryRunner.hasColumn('event', 'socialLinks'))) {
      await queryRunner.query(`
        ALTER TABLE \`event\`
        ADD COLUMN \`socialLinks\` json NULL DEFAULT NULL
        AFTER \`content\`
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('event', 'socialLinks')) {
      await queryRunner.query(`ALTER TABLE \`event\` DROP COLUMN \`socialLinks\``);
    }
    if (await queryRunner.hasColumn('event', 'content')) {
      await queryRunner.query(`ALTER TABLE \`event\` DROP COLUMN \`content\``);
    }
  }
}
