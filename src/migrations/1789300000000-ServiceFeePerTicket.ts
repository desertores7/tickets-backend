import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Costo de servicio por entrada (`BR-PAY-002`, 10% con tope por entrada).
 *
 * Hasta acá el fee vivía solo como total de la orden. Ahora cada entrada guarda
 * el fee y el descuento que se le aplicaron **al momento de la compra**: si el
 * Administrador cambia el tope, lo ya vendido no se recalcula. Recalcularlo
 * movería las métricas del evento y la división de montos con la productora.
 *
 * `orders.serviceFeeRate` y `serviceFeeCap` dejan asentado con qué regla se
 * cobró cada orden. Las órdenes previas quedan con 15% y sin tope, que es como
 * se cobraron.
 *
 * Backfill: el fee y el descuento de cada orden previa se reparten entre sus
 * líneas en proporción al subtotal, y dentro de cada línea en partes iguales.
 * Es lo más fiel posible: el fee viejo se calculaba sobre el total y no quedó
 * registro por entrada.
 */
export class ServiceFeePerTicket1789300000000 implements MigrationInterface {
  name = 'ServiceFeePerTicket1789300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`orders\`
        ADD COLUMN \`serviceFeeRate\` decimal(5,4) NULL DEFAULT NULL AFTER \`serviceFee\`,
        ADD COLUMN \`serviceFeeCap\` decimal(12,2) NULL DEFAULT NULL AFTER \`serviceFeeRate\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`order_item\`
        ADD COLUMN \`discountAmount\` decimal(10,2) NOT NULL DEFAULT 0 AFTER \`subtotal\`,
        ADD COLUMN \`serviceFee\` decimal(10,2) NOT NULL DEFAULT 0 AFTER \`discountAmount\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`ticket\`
        ADD COLUMN \`discountAmount\` decimal(10,2) NOT NULL DEFAULT 0 AFTER \`ticketNumber\`,
        ADD COLUMN \`serviceFee\` decimal(10,2) NOT NULL DEFAULT 0 AFTER \`discountAmount\`
    `);

    await queryRunner.query(`UPDATE \`orders\` SET \`serviceFeeRate\` = 0.15`);

    await queryRunner.query(`
      INSERT INTO \`system_parameter\` (\`uuid\`, \`key\`, \`value\`, \`description\`, \`type\`)
      VALUES (UUID(), 'SERVICE_FEE_CAP_ARS', '50000',
              'Tope del costo de servicio por entrada, en ARS. Lo edita el Administrador.', 'number')
      ON DUPLICATE KEY UPDATE \`key\` = \`key\`
    `);

    await this.backfill(queryRunner);
  }

  private async backfill(queryRunner: QueryRunner): Promise<void> {
    const items: {
      uuid: string;
      orderUuid: string;
      quantity: number;
      subtotal: string;
      orderServiceFee: string;
      orderDiscount: string;
    }[] = await queryRunner.query(`
      SELECT oi.uuid, oi.orderUuid, oi.quantity, oi.subtotal,
             o.serviceFee AS orderServiceFee, o.discountAmount AS orderDiscount
        FROM \`order_item\` oi
        JOIN \`orders\` o ON o.uuid = oi.orderUuid
       ORDER BY oi.orderUuid, oi.uuid
    `);

    const byOrder = new Map<string, typeof items>();
    for (const item of items) {
      const list = byOrder.get(item.orderUuid) ?? [];
      list.push(item);
      byOrder.set(item.orderUuid, list);
    }

    const tickets: { uuid: string; orderItemUuid: string }[] = await queryRunner.query(`
      SELECT uuid, orderItemUuid FROM \`ticket\` ORDER BY orderItemUuid, ticketNumber
    `);
    const ticketsByItem = new Map<string, string[]>();
    for (const t of tickets) {
      const list = ticketsByItem.get(t.orderItemUuid) ?? [];
      list.push(t.uuid);
      ticketsByItem.set(t.orderItemUuid, list);
    }

    for (const orderItems of byOrder.values()) {
      const weights = orderItems.map(i => cents(i.subtotal));
      const fees = proportional(cents(orderItems[0].orderServiceFee), weights);
      const discounts = proportional(cents(orderItems[0].orderDiscount), weights);

      for (let i = 0; i < orderItems.length; i++) {
        const item = orderItems[i];
        await queryRunner.query(
          `UPDATE \`order_item\` SET \`serviceFee\` = ?, \`discountAmount\` = ? WHERE uuid = ?`,
          [fees[i] / 100, discounts[i] / 100, item.uuid]
        );

        const itemTickets = ticketsByItem.get(item.uuid) ?? [];
        const ticketFees = evenly(fees[i], itemTickets.length);
        const ticketDiscounts = evenly(discounts[i], itemTickets.length);
        for (let t = 0; t < itemTickets.length; t++) {
          await queryRunner.query(
            `UPDATE \`ticket\` SET \`serviceFee\` = ?, \`discountAmount\` = ? WHERE uuid = ?`,
            [ticketFees[t] / 100, ticketDiscounts[t] / 100, itemTickets[t]]
          );
        }
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM \`system_parameter\` WHERE \`key\` = 'SERVICE_FEE_CAP_ARS'`);
    await queryRunner.query(`ALTER TABLE \`ticket\` DROP COLUMN \`serviceFee\`, DROP COLUMN \`discountAmount\``);
    await queryRunner.query(
      `ALTER TABLE \`order_item\` DROP COLUMN \`serviceFee\`, DROP COLUMN \`discountAmount\``
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` DROP COLUMN \`serviceFeeCap\`, DROP COLUMN \`serviceFeeRate\``
    );
  }
}

function cents(value: string | number | null): number {
  return Math.round(Number(value ?? 0) * 100);
}

/** Reparto proporcional en centavos; lo que sobra va a las primeras partes. */
function proportional(totalCents: number, weights: number[]): number[] {
  const weightTotal = weights.reduce((s, w) => s + w, 0);
  if (totalCents <= 0) return weights.map(() => 0);
  if (weightTotal <= 0) return evenly(totalCents, weights.length);

  const shares = weights.map(w => Math.floor((totalCents * w) / weightTotal));
  let rest = totalCents - shares.reduce((s, v) => s + v, 0);
  for (let i = 0; rest > 0; i = (i + 1) % shares.length, rest--) shares[i] += 1;
  return shares;
}

function evenly(totalCents: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(totalCents / parts);
  const rest = totalCents - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < rest ? 1 : 0));
}
