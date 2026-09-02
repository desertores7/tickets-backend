import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEventVenuePostalCode1784800000000 implements MigrationInterface {
  name = 'AddEventVenuePostalCode1784800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`event\`
      ADD COLUMN \`venuePostalCode\` varchar(20) NOT NULL DEFAULT ''
      AFTER \`venueCountry\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`event\` DROP COLUMN \`venuePostalCode\``);
  }
}
