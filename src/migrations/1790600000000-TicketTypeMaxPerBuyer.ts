import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tope acumulado de entradas por comprador (`maxPerBuyer`), distinto de
 * `maxPerOrder` (que solo limita una orden puntual). `null` = sin tope.
 */
export class TicketTypeMaxPerBuyer1790600000000 implements MigrationInterface {
  name = 'TicketTypeMaxPerBuyer1790600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`ticket_type\`
      ADD COLUMN \`maxPerBuyer\` int NULL DEFAULT NULL AFTER \`maxPerOrder\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`ticket_type\`
      DROP COLUMN \`maxPerBuyer\`
    `);
  }
}
