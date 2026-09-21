import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cómo se vende cada tanda (`BR-SALE-010`): general, por persona o unidad
 * completa, y cuántas entradas da una unidad completa.
 *
 * Las tandas existentes quedan en `general`, que es como se vendían hasta hoy:
 * por cantidad, sin elegir mesa. Compatible con el código anterior (solo agrega
 * columnas con default).
 */
export class TicketTypeSaleMode1789900000000 implements MigrationInterface {
  name = 'TicketTypeSaleMode1789900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`ticket_type\`
      ADD COLUMN \`saleMode\` ENUM('general', 'per_person', 'whole_unit') NOT NULL DEFAULT 'general' AFTER \`maxPerOrder\`,
      ADD COLUMN \`admissionsPerUnit\` int NULL DEFAULT NULL AFTER \`saleMode\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`ticket_type\`
      DROP COLUMN \`admissionsPerUnit\`,
      DROP COLUMN \`saleMode\`
    `);
  }
}
