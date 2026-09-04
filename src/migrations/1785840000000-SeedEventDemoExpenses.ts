import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gastos de demo para el evento `d8c9efdd-3124-4282-baf9-62fe3d7c150b`.
 * Idempotente por uuid fijo; no inserta si el evento no existe.
 */
const EVENT_UUID = 'd8c9efdd-3124-4282-baf9-62fe3d7c150b';

const DEMO_EXPENSES: Array<{
  uuid: string;
  category:
    | 'seguridad'
    | 'personal'
    | 'comida'
    | 'bebidas'
    | 'venue'
    | 'produccion'
    | 'marketing'
    | 'transporte'
    | 'permisos'
    | 'otro';
  concept: string;
  quantity: string;
  unitCost: string;
  totalAmount: string;
  expenseDate: string;
  notes: string | null;
}> = [
  {
    uuid: 'e8c9efdd-3124-4282-baf9-62fe3d7c1501',
    category: 'venue',
    concept: 'Alquiler del salón',
    quantity: '1.00',
    unitCost: '850000.00',
    totalAmount: '850000.00',
    expenseDate: '2026-08-15',
    notes: 'Incluye mesa y sillas básicas'
  },
  {
    uuid: 'e8c9efdd-3124-4282-baf9-62fe3d7c1502',
    category: 'seguridad',
    concept: 'Personal de seguridad',
    quantity: '8.00',
    unitCost: '45000.00',
    totalAmount: '360000.00',
    expenseDate: '2026-08-20',
    notes: 'Turno completo del evento'
  },
  {
    uuid: 'e8c9efdd-3124-4282-baf9-62fe3d7c1503',
    category: 'personal',
    concept: 'Staff de ingreso y acomodadores',
    quantity: '12.00',
    unitCost: '28000.00',
    totalAmount: '336000.00',
    expenseDate: '2026-08-20',
    notes: null
  },
  {
    uuid: 'e8c9efdd-3124-4282-baf9-62fe3d7c1504',
    category: 'produccion',
    concept: 'Sonido e iluminación',
    quantity: '1.00',
    unitCost: '520000.00',
    totalAmount: '520000.00',
    expenseDate: '2026-08-18',
    notes: 'PA + luces LED + operador'
  },
  {
    uuid: 'e8c9efdd-3124-4282-baf9-62fe3d7c1505',
    category: 'bebidas',
    concept: 'Barra y stock de bebidas',
    quantity: '1.00',
    unitCost: '275000.00',
    totalAmount: '275000.00',
    expenseDate: '2026-08-19',
    notes: 'Cerveza, gaseosas y hielo'
  },
  {
    uuid: 'e8c9efdd-3124-4282-baf9-62fe3d7c1506',
    category: 'comida',
    concept: 'Catering para staff',
    quantity: '40.00',
    unitCost: '6500.00',
    totalAmount: '260000.00',
    expenseDate: '2026-08-20',
    notes: 'Vianda + snack'
  },
  {
    uuid: 'e8c9efdd-3124-4282-baf9-62fe3d7c1507',
    category: 'marketing',
    concept: 'Pauta en redes',
    quantity: '1.00',
    unitCost: '180000.00',
    totalAmount: '180000.00',
    expenseDate: '2026-08-01',
    notes: 'Meta Ads + Instagram'
  },
  {
    uuid: 'e8c9efdd-3124-4282-baf9-62fe3d7c1508',
    category: 'transporte',
    concept: 'Flete de equipos',
    quantity: '2.00',
    unitCost: '55000.00',
    totalAmount: '110000.00',
    expenseDate: '2026-08-19',
    notes: 'Ida y vuelta'
  },
  {
    uuid: 'e8c9efdd-3124-4282-baf9-62fe3d7c1509',
    category: 'permisos',
    concept: 'Habilitación municipal',
    quantity: '1.00',
    unitCost: '95000.00',
    totalAmount: '95000.00',
    expenseDate: '2026-07-28',
    notes: null
  },
  {
    uuid: 'e8c9efdd-3124-4282-baf9-62fe3d7c1510',
    category: 'otro',
    concept: 'Materiales de señalética',
    quantity: '1.00',
    unitCost: '42000.00',
    totalAmount: '42000.00',
    expenseDate: '2026-08-17',
    notes: 'Cartelería de accesos y baños'
  },
  {
    uuid: 'e8c9efdd-3124-4282-baf9-62fe3d7c1511',
    category: 'produccion',
    concept: 'DJ / artista',
    quantity: '1.00',
    unitCost: '400000.00',
    totalAmount: '400000.00',
    expenseDate: '2026-08-10',
    notes: 'Caché acordado'
  },
  {
    uuid: 'e8c9efdd-3124-4282-baf9-62fe3d7c1512',
    category: 'seguridad',
    concept: 'Ambulancia en puerta',
    quantity: '1.00',
    unitCost: '120000.00',
    totalAmount: '120000.00',
    expenseDate: '2026-08-20',
    notes: 'Cobertura médica obligatoria'
  }
];

export class SeedEventDemoExpenses1785840000000 implements MigrationInterface {
  name = 'SeedEventDemoExpenses1785840000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const row of DEMO_EXPENSES) {
      await queryRunner.query(
        `
        INSERT INTO \`event_expense\`
          (\`uuid\`, \`eventUuid\`, \`category\`, \`concept\`, \`quantity\`, \`unitCost\`, \`totalAmount\`,
           \`expenseDate\`, \`notes\`, \`createdBy\`, \`isDeleted\`, \`createdAt\`, \`updatedAt\`)
        SELECT
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
        FROM DUAL
        WHERE EXISTS (
          SELECT 1 FROM \`event\` e
          WHERE e.\`uuid\` = ?
        )
        AND NOT EXISTS (
          SELECT 1 FROM \`event_expense\` x
          WHERE x.\`uuid\` = ?
        )
        `,
        [
          row.uuid,
          EVENT_UUID,
          row.category,
          row.concept,
          row.quantity,
          row.unitCost,
          row.totalAmount,
          row.expenseDate,
          row.notes,
          EVENT_UUID,
          row.uuid
        ]
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      DELETE FROM \`event_expense\`
      WHERE \`uuid\` IN (${DEMO_EXPENSES.map(() => '?').join(', ')})
      `,
      DEMO_EXPENSES.map(r => r.uuid)
    );
  }
}
