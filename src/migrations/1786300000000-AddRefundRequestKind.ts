import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Canal por el que se pide el reembolso (`BR-REFUND-007`).
 *
 * Hasta acá todas las solicitudes eran del mismo tipo: reembolso de política
 * propia por un cambio material del evento (`BR-REFUND-001`). El botón de
 * arrepentimiento es un canal **legal** distinto (Ley 24.240 / Disposición
 * 954/2025): no depende de que el productor haya cambiado nada, y su plazo se
 * cuenta desde la compra, no desde el evento.
 *
 * Comparten tabla porque comparten todo lo demás — el ticket como unidad, la
 * ejecución del reintegro en Mercado Pago, los estados y el cron. Lo único que
 * cambia es qué se valida, y eso es exactamente lo que distingue esta columna.
 *
 * Las filas existentes son todas del canal viejo, de ahí el default.
 */
export class AddRefundRequestKind1786300000000 implements MigrationInterface {
  name = 'AddRefundRequestKind1786300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `refund_request` ADD COLUMN `kind` " +
        "ENUM('material_change', 'withdrawal') NOT NULL DEFAULT 'material_change' " +
        'AFTER `status`'
    );

    // El cron levanta pendientes sin distinguir canal, pero el Admin y los
    // reportes sí filtran: el arrepentimiento tiene otra exposición legal.
    await queryRunner.query(
      'CREATE INDEX `IDX_refund_request_kind` ON `refund_request` (`kind`, `requestedAt`)'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX `IDX_refund_request_kind` ON `refund_request`');
    await queryRunner.query('ALTER TABLE `refund_request` DROP COLUMN `kind`');
  }
}
