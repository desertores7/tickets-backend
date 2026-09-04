import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cupones de demo para el evento `d8c9efdd-3124-4282-baf9-62fe3d7c150b`.
 * Idempotente por uuid fijo; no inserta si el evento no existe.
 * Variedad de tipos/estados para probar filtros y scroll infinito.
 */
const EVENT_UUID = 'd8c9efdd-3124-4282-baf9-62fe3d7c150b';

const DEMO_COUPONS: Array<{
  uuid: string;
  name: string;
  code: string;
  type: 'percent' | 'fixed';
  value: string;
  maxUses: number | null;
  usedCount: number;
  oncePerUser: number;
  validFrom: string | null;
  validUntil: string | null;
  active: number;
}> = [
  {
    uuid: 'c8c9efdd-3124-4282-baf9-62fe3d7c1501',
    name: 'Early bird',
    code: 'EARLY20',
    type: 'percent',
    value: '20.00',
    maxUses: 100,
    usedCount: 34,
    oncePerUser: 1,
    validFrom: '2026-07-01 00:00:00.000',
    validUntil: '2026-12-31 23:59:59.000',
    active: 1
  },
  {
    uuid: 'c8c9efdd-3124-4282-baf9-62fe3d7c1502',
    name: 'Invitados VIP',
    code: 'VIP5000',
    type: 'fixed',
    value: '5000.00',
    maxUses: 50,
    usedCount: 12,
    oncePerUser: 1,
    validFrom: null,
    validUntil: null,
    active: 1
  },
  {
    uuid: 'c8c9efdd-3124-4282-baf9-62fe3d7c1503',
    name: 'Flash 15%',
    code: 'FLASH15',
    type: 'percent',
    value: '15.00',
    maxUses: 30,
    usedCount: 30,
    oncePerUser: 0,
    validFrom: '2026-08-01 00:00:00.000',
    validUntil: '2026-09-30 23:59:59.000',
    active: 1
  },
  {
    uuid: 'c8c9efdd-3124-4282-baf9-62fe3d7c1504',
    name: 'Campaña pausada',
    code: 'PAUSA10',
    type: 'percent',
    value: '10.00',
    maxUses: null,
    usedCount: 5,
    oncePerUser: 0,
    validFrom: null,
    validUntil: null,
    active: 0
  },
  {
    uuid: 'c8c9efdd-3124-4282-baf9-62fe3d7c1505',
    name: 'Promo vencida',
    code: 'OLD25',
    type: 'percent',
    value: '25.00',
    maxUses: 200,
    usedCount: 88,
    oncePerUser: 0,
    validFrom: '2025-01-01 00:00:00.000',
    validUntil: '2025-12-31 23:59:59.000',
    active: 1
  },
  {
    uuid: 'c8c9efdd-3124-4282-baf9-62fe3d7c1506',
    name: 'Descuento staff',
    code: 'STAFF30',
    type: 'percent',
    value: '30.00',
    maxUses: 20,
    usedCount: 7,
    oncePerUser: 1,
    validFrom: null,
    validUntil: '2026-12-01 23:59:59.000',
    active: 1
  },
  {
    uuid: 'c8c9efdd-3124-4282-baf9-62fe3d7c1507',
    name: 'Combo fijo $2000',
    code: 'FIJO2000',
    type: 'fixed',
    value: '2000.00',
    maxUses: null,
    usedCount: 41,
    oncePerUser: 0,
    validFrom: null,
    validUntil: null,
    active: 1
  },
  {
    uuid: 'c8c9efdd-3124-4282-baf9-62fe3d7c1508',
    name: 'Influencers',
    code: 'INFLU10',
    type: 'percent',
    value: '10.00',
    maxUses: 15,
    usedCount: 15,
    oncePerUser: 1,
    validFrom: null,
    validUntil: null,
    active: 1
  },
  {
    uuid: 'c8c9efdd-3124-4282-baf9-62fe3d7c1509',
    name: 'Newsletter mayo',
    code: 'NEWSMAY',
    type: 'fixed',
    value: '1500.00',
    maxUses: 80,
    usedCount: 22,
    oncePerUser: 1,
    validFrom: '2026-05-01 00:00:00.000',
    validUntil: '2026-05-31 23:59:59.000',
    active: 1
  },
  {
    uuid: 'c8c9efdd-3124-4282-baf9-62fe3d7c150a',
    name: 'Socios club',
    code: 'CLUB12',
    type: 'percent',
    value: '12.00',
    maxUses: null,
    usedCount: 3,
    oncePerUser: 1,
    validFrom: null,
    validUntil: null,
    active: 0
  },
  {
    uuid: 'c8c9efdd-3124-4282-baf9-62fe3d7c150b',
    name: 'Lanzamiento 40%',
    code: 'LAUNCH40',
    type: 'percent',
    value: '40.00',
    maxUses: 10,
    usedCount: 9,
    oncePerUser: 1,
    validFrom: null,
    validUntil: '2026-11-15 23:59:59.000',
    active: 1
  },
  {
    uuid: 'c8c9efdd-3124-4282-baf9-62fe3d7c150c',
    name: 'Grupo amigos',
    code: 'AMIGOS3K',
    type: 'fixed',
    value: '3000.00',
    maxUses: 40,
    usedCount: 18,
    oncePerUser: 0,
    validFrom: null,
    validUntil: null,
    active: 1
  },
  {
    uuid: 'c8c9efdd-3124-4282-baf9-62fe3d7c150d',
    name: 'Black Friday',
    code: 'BF50',
    type: 'percent',
    value: '50.00',
    maxUses: 25,
    usedCount: 25,
    oncePerUser: 1,
    validFrom: '2025-11-20 00:00:00.000',
    validUntil: '2025-11-30 23:59:59.000',
    active: 1
  },
  {
    uuid: 'c8c9efdd-3124-4282-baf9-62fe3d7c150e',
    name: 'Cortesía productora',
    code: 'CORTESIA',
    type: 'fixed',
    value: '10000.00',
    maxUses: 5,
    usedCount: 1,
    oncePerUser: 1,
    validFrom: null,
    validUntil: null,
    active: 1
  },
  {
    uuid: 'c8c9efdd-3124-4282-baf9-62fe3d7c150f',
    name: 'Radios locales',
    code: 'RADIO8',
    type: 'percent',
    value: '8.00',
    maxUses: null,
    usedCount: 14,
    oncePerUser: 0,
    validFrom: null,
    validUntil: null,
    active: 1
  },
  {
    uuid: 'c8c9efdd-3124-4282-baf9-62fe3d7c1510',
    name: 'Universidad',
    code: 'UNI15',
    type: 'percent',
    value: '15.00',
    maxUses: 60,
    usedCount: 27,
    oncePerUser: 1,
    validFrom: null,
    validUntil: '2026-10-31 23:59:59.000',
    active: 1
  },
  {
    uuid: 'c8c9efdd-3124-4282-baf9-62fe3d7c1511',
    name: 'Reserva anticipada',
    code: 'PREVENTA',
    type: 'fixed',
    value: '2500.00',
    maxUses: 100,
    usedCount: 55,
    oncePerUser: 1,
    validFrom: null,
    validUntil: null,
    active: 1
  },
  {
    uuid: 'c8c9efdd-3124-4282-baf9-62fe3d7c1512',
    name: 'Test pausado 2',
    code: 'HOLD5',
    type: 'percent',
    value: '5.00',
    maxUses: null,
    usedCount: 0,
    oncePerUser: 0,
    validFrom: null,
    validUntil: null,
    active: 0
  }
];

export class SeedEventDemoCoupons1785860000000 implements MigrationInterface {
  name = 'SeedEventDemoCoupons1785860000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const row of DEMO_COUPONS) {
      await queryRunner.query(
        `
        INSERT INTO \`coupon\`
          (\`uuid\`, \`eventUuid\`, \`name\`, \`code\`, \`type\`, \`value\`,
           \`maxUses\`, \`usedCount\`, \`oncePerUser\`, \`validFrom\`, \`validUntil\`,
           \`active\`, \`isDeleted\`, \`createdAt\`, \`updatedAt\`)
        SELECT
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
        FROM DUAL
        WHERE EXISTS (
          SELECT 1 FROM \`event\` e
          WHERE e.\`uuid\` = ?
        )
        AND NOT EXISTS (
          SELECT 1 FROM \`coupon\` x
          WHERE x.\`uuid\` = ?
        )
        `,
        [
          row.uuid,
          EVENT_UUID,
          row.name,
          row.code,
          row.type,
          row.value,
          row.maxUses,
          row.usedCount,
          row.oncePerUser,
          row.validFrom,
          row.validUntil,
          row.active,
          EVENT_UUID,
          row.uuid
        ]
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      DELETE FROM \`coupon\`
      WHERE \`uuid\` IN (${DEMO_COUPONS.map(() => '?').join(', ')})
      `,
      DEMO_COUPONS.map(r => r.uuid)
    );
  }
}
