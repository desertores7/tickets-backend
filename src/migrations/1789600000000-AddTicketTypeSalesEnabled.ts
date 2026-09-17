import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTicketTypeSalesEnabled1789600000000 implements MigrationInterface {
  name = 'AddTicketTypeSalesEnabled1789600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`ticket_type\`
      ADD COLUMN \`salesEnabled\` tinyint(1) NOT NULL DEFAULT 1 AFTER \`isActive\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`ticket_type\` DROP COLUMN \`salesEnabled\``);
  }
}
