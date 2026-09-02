import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Liquidaciones de demo para la productora de desarrollo
 * (`aa3b9fa2-17dc-45e5-be9d-6b75816d78e9`), creadas por el admin
 * `4f1eec73-f99c-4246-a88e-a6916898ab3a`. Idempotente por uuid fijo.
 *
 * Usa eventos reales de esa org; si el evento no existe, la fila no se inserta.
 */
const ORG_UUID = 'aa3b9fa2-17dc-45e5-be9d-6b75816d78e9';
const ADMIN_UUID = '4f1eec73-f99c-4246-a88e-a6916898ab3a';

const DEMO_PAYOUTS: Array<{
  uuid: string;
  eventUuid: string;
  amount: string;
  transferredAt: string;
  notes: string | null;
  status: 'registered' | 'invoice_pending' | 'invoice_available';
}> = [
  {
    uuid: 'a1111111-1111-4111-8111-111111111101',
    eventUuid: '0c79254c-6a54-4144-b2be-5fbed6dc5b80',
    amount: '1850000.00',
    transferredAt: '2026-10-04 18:30:00.000',
    notes: 'Liquidación del día del evento',
    status: 'invoice_available'
  },
  {
    uuid: 'a1111111-1111-4111-8111-111111111102',
    eventUuid: '130ecdaa-9a95-43f0-a427-76b1efa814b5',
    amount: '920450.50',
    transferredAt: '2026-10-11 20:15:00.000',
    notes: null,
    status: 'invoice_pending'
  },
  {
    uuid: 'a1111111-1111-4111-8111-111111111103',
    eventUuid: 'bf092d2a-5530-4582-8554-4527aa0d8fe3',
    amount: '1543200.00',
    transferredAt: '2026-11-22 22:00:00.000',
    notes: 'Primera tanda',
    status: 'registered'
  },
  {
    uuid: 'a1111111-1111-4111-8111-111111111104',
    eventUuid: 'bf092d2a-5530-4582-8554-4527aa0d8fe3',
    amount: '410800.00',
    transferredAt: '2026-11-25 15:45:00.000',
    notes: 'Segunda tanda (cierres tardíos)',
    status: 'invoice_pending'
  },
  {
    uuid: 'a1111111-1111-4111-8111-111111111105',
    eventUuid: '6c0fa2c8-d5aa-4223-a5cd-cd08b1e17159',
    amount: '678900.00',
    transferredAt: '2027-01-22 19:10:00.000',
    notes: null,
    status: 'registered'
  },
  {
    uuid: 'a1111111-1111-4111-8111-111111111106',
    eventUuid: 'c6a91aee-fb4e-47d8-885b-003e73168fc7',
    amount: '2100450.75',
    transferredAt: '2027-05-19 21:00:00.000',
    notes: 'Liquidación completa',
    status: 'invoice_available'
  }
];

export class SeedDemoPayouts1785700000000 implements MigrationInterface {
  name = 'SeedDemoPayouts1785700000000';

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
          row.eventUuid,
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
