import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Liquidaciones extra de demo para el evento `d8c9efdd-3124-4282-baf9-62fe3d7c150b`
 * (mismo que gastos/cupones). Idempotente por uuid fijo.
 * Cantidad pensada para probar scroll infinito (page size 10 en el front).
 */
const ORG_UUID = 'aa3b9fa2-17dc-45e5-be9d-6b75816d78e9';
const ADMIN_UUID = '4f1eec73-f99c-4246-a88e-a6916898ab3a';
const EVENT_UUID = 'd8c9efdd-3124-4282-baf9-62fe3d7c150b';

const DEMO_PAYOUTS: Array<{
  uuid: string;
  amount: string;
  transferredAt: string;
  notes: string | null;
  status: 'registered' | 'invoice_pending' | 'invoice_available';
}> = [
  {
    uuid: 'a8c9efdd-3124-4282-baf9-62fe3d7c1601',
    amount: '125000.00',
    transferredAt: '2026-08-02 18:00:00.000',
    notes: 'Anticipo preventa',
    status: 'invoice_available'
  },
  {
    uuid: 'a8c9efdd-3124-4282-baf9-62fe3d7c1602',
    amount: '248500.50',
    transferredAt: '2026-08-05 19:30:00.000',
    notes: null,
    status: 'registered'
  },
  {
    uuid: 'a8c9efdd-3124-4282-baf9-62fe3d7c1603',
    amount: '89000.00',
    transferredAt: '2026-08-08 12:15:00.000',
    notes: 'Cierre parcial web',
    status: 'invoice_pending'
  },
  {
    uuid: 'a8c9efdd-3124-4282-baf9-62fe3d7c1604',
    amount: '312750.25',
    transferredAt: '2026-08-10 21:00:00.000',
    notes: null,
    status: 'invoice_available'
  },
  {
    uuid: 'a8c9efdd-3124-4282-baf9-62fe3d7c1605',
    amount: '156200.00',
    transferredAt: '2026-08-12 16:45:00.000',
    notes: 'Tanda early bird',
    status: 'registered'
  },
  {
    uuid: 'a8c9efdd-3124-4282-baf9-62fe3d7c1606',
    amount: '401300.00',
    transferredAt: '2026-08-14 20:10:00.000',
    notes: null,
    status: 'invoice_pending'
  },
  {
    uuid: 'a8c9efdd-3124-4282-baf9-62fe3d7c1607',
    amount: '97850.75',
    transferredAt: '2026-08-16 11:20:00.000',
    notes: 'Ajuste posventa',
    status: 'registered'
  },
  {
    uuid: 'a8c9efdd-3124-4282-baf9-62fe3d7c1608',
    amount: '520000.00',
    transferredAt: '2026-08-18 22:00:00.000',
    notes: 'Liquidación mayor',
    status: 'invoice_available'
  },
  {
    uuid: 'a8c9efdd-3124-4282-baf9-62fe3d7c1609',
    amount: '134600.00',
    transferredAt: '2026-08-20 17:35:00.000',
    notes: null,
    status: 'invoice_pending'
  },
  {
    uuid: 'a8c9efdd-3124-4282-baf9-62fe3d7c160a',
    amount: '275400.50',
    transferredAt: '2026-08-22 19:50:00.000',
    notes: 'Cierre fin de semana',
    status: 'registered'
  },
  {
    uuid: 'a8c9efdd-3124-4282-baf9-62fe3d7c160b',
    amount: '188900.00',
    transferredAt: '2026-08-24 14:00:00.000',
    notes: null,
    status: 'invoice_available'
  },
  {
    uuid: 'a8c9efdd-3124-4282-baf9-62fe3d7c160c',
    amount: '66325.25',
    transferredAt: '2026-08-26 10:30:00.000',
    notes: 'Reintegro parcial neto',
    status: 'registered'
  },
  {
    uuid: 'a8c9efdd-3124-4282-baf9-62fe3d7c160d',
    amount: '390150.00',
    transferredAt: '2026-08-28 21:15:00.000',
    notes: null,
    status: 'invoice_pending'
  },
  {
    uuid: 'a8c9efdd-3124-4282-baf9-62fe3d7c160e',
    amount: '215780.00',
    transferredAt: '2026-08-30 18:40:00.000',
    notes: 'Última tanda previa',
    status: 'invoice_available'
  },
  {
    uuid: 'a8c9efdd-3124-4282-baf9-62fe3d7c160f',
    amount: '147200.50',
    transferredAt: '2026-09-01 13:05:00.000',
    notes: null,
    status: 'registered'
  },
  {
    uuid: 'a8c9efdd-3124-4282-baf9-62fe3d7c1610',
    amount: '498000.00',
    transferredAt: '2026-09-03 20:00:00.000',
    notes: 'Día del evento',
    status: 'invoice_available'
  },
  {
    uuid: 'a8c9efdd-3124-4282-baf9-62fe3d7c1611',
    amount: '112450.00',
    transferredAt: '2026-09-05 15:25:00.000',
    notes: 'Cierres tardíos',
    status: 'invoice_pending'
  },
  {
    uuid: 'a8c9efdd-3124-4282-baf9-62fe3d7c1612',
    amount: '83075.75',
    transferredAt: '2026-09-07 09:50:00.000',
    notes: null,
    status: 'registered'
  }
];

export class SeedEventDemoPayoutsMore1785870000000 implements MigrationInterface {
  name = 'SeedEventDemoPayoutsMore1785870000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const row of DEMO_PAYOUTS) {
      await queryRunner.query(
        `
        INSERT INTO payout (
          uuid, organizationUuid, eventUuid, amount, transferredAt, notes, status,
          transferProofFileUuid, arcaInvoiceFileUuid, createdBy, isDeleted, createdAt, updatedAt
        )
        SELECT
          ?, ?, e.uuid, ?, ?, ?, ?,
          NULL, NULL, ?, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
        FROM event e
        INNER JOIN organization o ON o.uuid = ?
        WHERE e.uuid = ?
          AND e.organizationUuid = ?
        ON DUPLICATE KEY UPDATE
          amount = VALUES(amount),
          transferredAt = VALUES(transferredAt),
          notes = VALUES(notes),
          status = VALUES(status),
          createdBy = VALUES(createdBy),
          isDeleted = NULL,
          updatedAt = CURRENT_TIMESTAMP(3)
        `,
        [
          row.uuid,
          ORG_UUID,
          row.amount,
          row.transferredAt,
          row.notes,
          row.status,
          ADMIN_UUID,
          ORG_UUID,
          EVENT_UUID,
          ORG_UUID
        ]
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const uuids = DEMO_PAYOUTS.map((p) => p.uuid);
    await queryRunner.query(
      `DELETE FROM payout WHERE uuid IN (${uuids.map(() => '?').join(', ')})`,
      uuids
    );
  }
}
