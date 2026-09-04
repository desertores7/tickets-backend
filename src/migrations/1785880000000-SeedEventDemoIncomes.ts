import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 30 ingresos de demo para probar scroll infinito y filtros en Ingresos.
 * Evento: d8c9efdd-3124-4282-baf9-62fe3d7c150b (mismo que gastos/cupones).
 * Idempotente por uuid fijo.
 */
const EVENT_UUID = 'd8c9efdd-3124-4282-baf9-62fe3d7c150b';

const METHODS = ['cash', 'mercadopago', 'other'] as const;
const PRODUCTS = [
  { type: 'entrada', name: 'Entrada General (puerta)', unitPrice: 15000 },
  { type: 'entrada', name: 'Entrada VIP (puerta)', unitPrice: 28000 },
  { type: 'manual', name: 'Barra — cerveza', unitPrice: 3500 },
  { type: 'manual', name: 'Barra — gaseosa', unitPrice: 2500 },
  { type: 'otros', name: 'Merchandising', unitPrice: 8000 },
  { type: 'otros', name: 'Estacionamiento', unitPrice: 5000 }
] as const;

type DemoIncome = {
  uuid: string;
  method: (typeof METHODS)[number];
  occurredAt: string;
  notes: string | null;
  total: string;
  productUuid: string;
  productType: string;
  productName: string;
  quantity: string;
  unitPrice: string;
  subtotal: string;
};

function pad2(n: number): string {
  return n.toString(16).padStart(2, '0');
}

const DEMO_INCOMES: DemoIncome[] = Array.from({ length: 30 }, (_, i) => {
  const n = i + 1;
  const method = METHODS[i % METHODS.length];
  const product = PRODUCTS[i % PRODUCTS.length];
  const quantity = (i % 4) + 1;
  const unitPrice = product.unitPrice + (i % 5) * 500;
  const subtotal = quantity * unitPrice;
  const day = String((i % 28) + 1).padStart(2, '0');
  const hour = String(10 + (i % 10)).padStart(2, '0');

  return {
    uuid: `f8c9efdd-3124-4282-baf9-62fe3d7c15${pad2(n)}`,
    method,
    occurredAt: `2026-08-${day} ${hour}:30:00.000`,
    notes: i % 3 === 0 ? `Demo cobro #${n}` : null,
    total: subtotal.toFixed(2),
    productUuid: `f9c9efdd-3124-4282-baf9-62fe3d7c15${pad2(n)}`,
    productType: product.type,
    productName: product.name,
    quantity: quantity.toFixed(2),
    unitPrice: unitPrice.toFixed(2),
    subtotal: subtotal.toFixed(2)
  };
});

export class SeedEventDemoIncomes1785880000000 implements MigrationInterface {
  name = 'SeedEventDemoIncomes1785880000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const row of DEMO_INCOMES) {
      await queryRunner.query(
        `
        INSERT INTO \`event_income\`
          (\`uuid\`, \`eventUuid\`, \`source\`, \`method\`, \`occurredAt\`, \`notes\`, \`total\`,
           \`mpMovementUuid\`, \`createdBy\`, \`isDeleted\`, \`createdAt\`, \`updatedAt\`)
        SELECT
          ?, ?, 'manual', ?, ?, ?, ?,
          NULL,
          (
            SELECT uo.\`userUuid\`
            FROM \`event\` e
            INNER JOIN \`user_organization\` uo
              ON uo.\`organizationUuid\` = e.\`organizationUuid\`
             AND uo.\`isDeleted\` IS NULL
            WHERE e.\`uuid\` = ?
            ORDER BY uo.\`createdAt\` ASC
            LIMIT 1
          ),
          NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
        FROM DUAL
        WHERE EXISTS (
          SELECT 1 FROM \`event\` e WHERE e.\`uuid\` = ?
        )
        AND NOT EXISTS (
          SELECT 1 FROM \`event_income\` x WHERE x.\`uuid\` = ?
        )
        `,
        [
          row.uuid,
          EVENT_UUID,
          row.method,
          row.occurredAt,
          row.notes,
          row.total,
          EVENT_UUID,
          EVENT_UUID,
          row.uuid
        ]
      );

      await queryRunner.query(
        `
        INSERT INTO \`event_income_product\`
          (\`uuid\`, \`eventIncomeUuid\`, \`type\`, \`referenceUuid\`, \`name\`,
           \`quantity\`, \`unitPrice\`, \`subtotal\`, \`createdAt\`)
        SELECT
          ?, ?, ?, NULL, ?,
          ?, ?, ?, CURRENT_TIMESTAMP(3)
        FROM DUAL
        WHERE EXISTS (
          SELECT 1 FROM \`event_income\` i WHERE i.\`uuid\` = ?
        )
        AND NOT EXISTS (
          SELECT 1 FROM \`event_income_product\` p WHERE p.\`uuid\` = ?
        )
        `,
        [
          row.productUuid,
          row.uuid,
          row.productType,
          row.productName,
          row.quantity,
          row.unitPrice,
          row.subtotal,
          row.uuid,
          row.productUuid
        ]
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const incomeUuids = DEMO_INCOMES.map(r => r.uuid);
    const productUuids = DEMO_INCOMES.map(r => r.productUuid);
    if (!incomeUuids.length) return;

    const productPlaceholders = productUuids.map(() => '?').join(', ');
    const incomePlaceholders = incomeUuids.map(() => '?').join(', ');

    await queryRunner.query(
      `DELETE FROM \`event_income_product\` WHERE \`uuid\` IN (${productPlaceholders})`,
      productUuids
    );
    await queryRunner.query(
      `DELETE FROM \`event_income\` WHERE \`uuid\` IN (${incomePlaceholders})`,
      incomeUuids
    );
  }
}
