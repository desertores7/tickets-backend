import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Registra el uso de los cupones de órdenes YA pagadas.
 *
 * Hasta ahora `confirmPayment` no registraba el canje: la orden quedaba pagada
 * con `couponUuid` y `discountAmount`, pero sin fila en `coupon_redemption` y
 * sin sumar `coupon.usedCount`. Resultado: la vista de cupones mostraba 0 usos
 * y el límite de usos nunca se alcanzaba.
 *
 * - Crea la fila faltante por cada orden pagada con cupón (el índice único por
 *   orden evita duplicar si ya existía).
 * - Recalcula `usedCount` desde `coupon_redemption`, que es el registro real.
 *
 * Idempotente: correrla dos veces deja el mismo resultado. Compatible con el
 * código anterior (solo datos, sin cambios de esquema).
 */
export class BackfillCouponRedemptions1790500000000 implements MigrationInterface {
  name = 'BackfillCouponRedemptions1790500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO \`coupon_redemption\` (\`uuid\`, \`couponUuid\`, \`orderUuid\`, \`userUuid\`, \`discountAmount\`, \`createdAt\`)
      SELECT UUID(), o.\`couponUuid\`, o.\`uuid\`, o.\`userUuid\`, o.\`discountAmount\`, COALESCE(o.\`paidAt\`, o.\`updatedAt\`)
      FROM \`orders\` o
      INNER JOIN \`coupon\` c ON c.\`uuid\` = o.\`couponUuid\`
      LEFT JOIN \`coupon_redemption\` r ON r.\`orderUuid\` = o.\`uuid\`
      WHERE o.\`couponUuid\` IS NOT NULL
        AND o.\`status\` = 'paid'
        AND r.\`uuid\` IS NULL
    `);

    await queryRunner.query(`
      UPDATE \`coupon\` c
      LEFT JOIN (
        SELECT \`couponUuid\`, COUNT(*) AS uses
        FROM \`coupon_redemption\`
        GROUP BY \`couponUuid\`
      ) r ON r.\`couponUuid\` = c.\`uuid\`
      SET c.\`usedCount\` = COALESCE(r.uses, 0)
    `);
  }

  public async down(): Promise<void> {
    // Sin vuelta atrás: las filas creadas son usos reales de cupones pagados.
    // Borrarlas volvería a dejar los contadores en 0 con ventas hechas.
  }
}
