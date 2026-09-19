import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Compra por unidad del mapa (`BR-SALE-010`): la mesa 8, el palco 12.
 *
 * - `order_item` y `ticket` guardan la unidad (`sectorUuid`) y una etiqueta
 *   congelada ("Mesa VIP · 8"). Congelada porque el productor puede renombrar o
 *   rearmar el mapa después de vender, y la entrada tiene que seguir diciendo lo
 *   que se compró.
 * - `order_item.admissionsPerUnit`: cuántas entradas genera cada unidad de la
 *   línea (1 salvo en unidad completa). Se fija al crear la orden, como el fee.
 * - `sector_occupancy`: lugares tomados por unidad (vendidos + retenidos por
 *   órdenes sin pagar). Se incrementa con un UPDATE condicional dentro de la
 *   transacción de la orden: dos compradores que eligen la misma mesa a la vez
 *   no pueden pasar los dos.
 * - `sector_hold`: qué orden tomó qué lugares. Liberar es borrar las filas de la
 *   orden y descontar lo borrado, así liberar dos veces (el job de vencimiento y
 *   el barrido) no descuenta dos veces.
 *
 * Sin FK a `event_map_sector` a propósito: el guardado del mapa reemplaza
 * sectores, y una FK frenaría ese guardado o arrastraría la venta.
 */
export class SectorUnitPurchase1790000000000 implements MigrationInterface {
  name = 'SectorUnitPurchase1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`order_item\`
      ADD COLUMN \`sectorUuid\` varchar(36) NULL DEFAULT NULL AFTER \`ticketTypeUuid\`,
      ADD COLUMN \`unitLabel\` varchar(255) NULL DEFAULT NULL AFTER \`sectorUuid\`,
      ADD COLUMN \`admissionsPerUnit\` int NOT NULL DEFAULT 1 AFTER \`quantity\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`ticket\`
      ADD COLUMN \`sectorUuid\` varchar(36) NULL DEFAULT NULL AFTER \`ticketTypeUuid\`,
      ADD COLUMN \`unitLabel\` varchar(255) NULL DEFAULT NULL AFTER \`sectorUuid\`
    `);
    await queryRunner.query(`
      CREATE TABLE \`sector_occupancy\` (
        \`sectorUuid\` varchar(36) NOT NULL,
        \`eventUuid\` varchar(36) NOT NULL,
        \`used\` int NOT NULL DEFAULT 0,
        \`updatedAt\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`sectorUuid\`),
        KEY \`IDX_sector_occupancy_event\` (\`eventUuid\`)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE \`sector_hold\` (
        \`uuid\` varchar(36) NOT NULL,
        \`sectorUuid\` varchar(36) NOT NULL,
        \`orderUuid\` varchar(36) NOT NULL,
        \`seats\` int NOT NULL,
        \`createdAt\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`uuid\`),
        KEY \`IDX_sector_hold_order\` (\`orderUuid\`),
        KEY \`IDX_sector_hold_sector\` (\`sectorUuid\`)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `sector_hold`');
    await queryRunner.query('DROP TABLE `sector_occupancy`');
    await queryRunner.query('ALTER TABLE `ticket` DROP COLUMN `unitLabel`, DROP COLUMN `sectorUuid`');
    await queryRunner.query(
      'ALTER TABLE `order_item` DROP COLUMN `admissionsPerUnit`, DROP COLUMN `unitLabel`, DROP COLUMN `sectorUuid`'
    );
  }
}
