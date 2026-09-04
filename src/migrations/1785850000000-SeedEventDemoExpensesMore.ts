import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 18 gastos extra de demo para el evento `d8c9efdd-3124-4282-baf9-62fe3d7c150b`.
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
    uuid: 'e8c9efdd-3124-4282-baf9-62fe3d7c1513',
    category: 'venue',
    concept: 'Limpieza post-evento',
    quantity: '1.00',
    unitCost: '78000.00',
    totalAmount: '78000.00',
    expenseDate: '2026-08-21',
    notes: 'Cuadrilla de 4 personas'
  },
  {
    uuid: 'e8c9efdd-3124-4282-baf9-62fe3d7c1514',
    category: 'produccion',
    concept: 'Generador eléctrico',
    quantity: '1.00',
    unitCost: '145000.00',
    totalAmount: '145000.00',
    expenseDate: '2026-08-18',
    notes: 'Backup 80 kVA'
  },
  {
    uuid: 'e8c9efdd-3124-4282-baf9-62fe3d7c1515',
    category: 'produccion',
    concept: 'Escenario y tarima',
    quantity: '1.00',
    unitCost: '210000.00',
    totalAmount: '210000.00',
    expenseDate: '2026-08-17',
    notes: 'Montaje y desmontaje'
  },
  {
    uuid: 'e8c9efdd-3124-4282-baf9-62fe3d7c1516',
    category: 'personal',
    concept: 'Técnicos de sonido',
    quantity: '3.00',
    unitCost: '42000.00',
    totalAmount: '126000.00',
    expenseDate: '2026-08-20',
    notes: null
  },
  {
    uuid: 'e8c9efdd-3124-4282-baf9-62fe3d7c1517',
    category: 'personal',
    concept: 'Barman y runners',
    quantity: '6.00',
    unitCost: '32000.00',
    totalAmount: '192000.00',
    expenseDate: '2026-08-20',
    notes: 'Turno de 8 horas'
  },
  {
    uuid: 'e8c9efdd-3124-4282-baf9-62fe3d7c1518',
    category: 'bebidas',
    concept: 'Vinos y destilados',
    quantity: '1.00',
    unitCost: '198000.00',
    totalAmount: '198000.00',
    expenseDate: '2026-08-19',
    notes: 'Reposición de barra premium'
  },
  {
    uuid: 'e8c9efdd-3124-4282-baf9-62fe3d7c1519',
    category: 'comida',
    concept: 'Food trucks para público',
    quantity: '2.00',
    unitCost: '95000.00',
    totalAmount: '190000.00',
    expenseDate: '2026-08-20',
    notes: 'Canon de espacio'
  },
  {
    uuid: 'e8c9efdd-3124-4282-baf9-62fe3d7c1520',
    category: 'marketing',
    concept: 'Diseño de piezas gráficas',
    quantity: '1.00',
    unitCost: '65000.00',
    totalAmount: '65000.00',
    expenseDate: '2026-07-20',
    notes: 'Stories, flyers y stories ads'
  },
  {
    uuid: 'e8c9efdd-3124-4282-baf9-62fe3d7c1521',
    category: 'marketing',
    concept: 'Influencers / invitaciones',
    quantity: '4.00',
    unitCost: '25000.00',
    totalAmount: '100000.00',
    expenseDate: '2026-08-05',
    notes: 'Canje + honorarios'
  },
  {
    uuid: 'e8c9efdd-3124-4282-baf9-62fe3d7c1522',
    category: 'transporte',
    concept: 'Traslado de artistas',
    quantity: '1.00',
    unitCost: '88000.00',
    totalAmount: '88000.00',
    expenseDate: '2026-08-20',
    notes: 'Remis ida y vuelta'
  },
  {
    uuid: 'e8c9efdd-3124-4282-baf9-62fe3d7c1523',
    category: 'transporte',
    concept: 'Estacionamiento de vans',
    quantity: '3.00',
    unitCost: '12000.00',
    totalAmount: '36000.00',
    expenseDate: '2026-08-20',
    notes: null
  },
  {
    uuid: 'e8c9efdd-3124-4282-baf9-62fe3d7c1524',
    category: 'seguridad',
    concept: 'Detectores y control de acceso',
    quantity: '4.00',
    unitCost: '18000.00',
    totalAmount: '72000.00',
    expenseDate: '2026-08-20',
    notes: 'Alquiler de arco + wands'
  },
  {
    uuid: 'e8c9efdd-3124-4282-baf9-62fe3d7c1525',
    category: 'permisos',
    concept: 'Seguro de responsabilidad civil',
    quantity: '1.00',
    unitCost: '135000.00',
    totalAmount: '135000.00',
    expenseDate: '2026-07-25',
    notes: 'Póliza del día del evento'
  },
  {
    uuid: 'e8c9efdd-3124-4282-baf9-62fe3d7c1526',
    category: 'permisos',
    concept: 'Derechos SADAIC',
    quantity: '1.00',
    unitCost: '58000.00',
    totalAmount: '58000.00',
    expenseDate: '2026-08-08',
    notes: null
  },
  {
    uuid: 'e8c9efdd-3124-4282-baf9-62fe3d7c1527',
    category: 'otro',
    concept: 'Baños químicos extra',
    quantity: '6.00',
    unitCost: '15000.00',
    totalAmount: '90000.00',
    expenseDate: '2026-08-19',
    notes: 'Incluye retiro'
  },
  {
    uuid: 'e8c9efdd-3124-4282-baf9-62fe3d7c1528',
    category: 'otro',
    concept: 'Pulseras RFID / tickets extra',
    quantity: '500.00',
    unitCost: '85.00',
    totalAmount: '42500.00',
    expenseDate: '2026-08-12',
    notes: 'Reposición de cortesías'
  },
  {
    uuid: 'e8c9efdd-3124-4282-baf9-62fe3d7c1529',
    category: 'venue',
    concept: 'Aire acondicionado adicional',
    quantity: '2.00',
    unitCost: '47000.00',
    totalAmount: '94000.00',
    expenseDate: '2026-08-18',
    notes: 'Equipos móviles'
  },
  {
    uuid: 'e8c9efdd-3124-4282-baf9-62fe3d7c1530',
    category: 'comida',
    concept: 'Agua y snacks backstage',
    quantity: '1.00',
    unitCost: '38000.00',
    totalAmount: '38000.00',
    expenseDate: '2026-08-20',
    notes: 'Rider básico'
  }
];

export class SeedEventDemoExpensesMore1785850000000 implements MigrationInterface {
  name = 'SeedEventDemoExpensesMore1785850000000';

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
