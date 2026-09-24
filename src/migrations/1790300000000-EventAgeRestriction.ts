import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Restricción de edad del evento (select en "Datos del evento", se muestra
 * como "EDAD" en la ficha pública). Ver `EVENT_AGE_RESTRICTIONS`.
 */
export class EventAgeRestriction1790300000000 implements MigrationInterface {
  name = 'EventAgeRestriction1790300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('event', 'ageRestriction'))) {
      await queryRunner.query(`
        ALTER TABLE \`event\`
        ADD COLUMN \`ageRestriction\` enum('ALL_AGES', 'PLUS_16', 'PLUS_18', 'PLUS_21', 'MINORS_WITH_ADULT')
        NOT NULL DEFAULT 'ALL_AGES'
        AFTER \`maxCapacity\`
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('event', 'ageRestriction')) {
      await queryRunner.query(`ALTER TABLE \`event\` DROP COLUMN \`ageRestriction\``);
    }
  }
}
