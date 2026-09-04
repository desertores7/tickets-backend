import { MigrationInterface, QueryRunner } from 'typeorm';

/** Elimina el campo proveedor de las líneas de gasto (FP08). */
export class DropEventExpenseSupplier1784610000000 implements MigrationInterface {
  name = 'DropEventExpenseSupplier1784610000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`event_expense\` DROP COLUMN \`supplier\``);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`event_expense\` ADD \`supplier\` varchar(255) NOT NULL DEFAULT ''`
    );
  }
}
