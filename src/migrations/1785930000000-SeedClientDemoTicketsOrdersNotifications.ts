import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seed de demo para probar las vistas Cliente: Entradas, Compras y Notificaciones.
 * Usuario: 273715f3-3c19-42f7-afb3-e5fa4513b28c
 *
 * Incluye:
 * - 4 eventos propios (2 próximos + 2 pasados) con tandas
 * - 10 órdenes con estados variados
 * - ~20 tickets (active / used / cancelled)
 * - 20 notificaciones (leídas / no leídas)
 *
 * Idempotente por uuid fijo. No inserta si el user o alguna org no existen.
 */

const TARGET_USER_UUID = '273715f3-3c19-42f7-afb3-e5fa4513b28c';

type SeedEvent = {
  uuid: string;
  name: string;
  slug: string;
  description: string;
  startDate: string;
  endDate: string;
  venueName: string;
  venueAddress: string;
  venueCity: string;
  venuePostalCode: string;
  maxCapacity: number;
  posterSeed: string;
  ticketTypes: Array<{
    uuid: string;
    name: string;
    price: string;
    quantity: number;
    sortOrder: number;
  }>;
};

const DEMO_EVENTS: SeedEvent[] = [
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b201',
    name: 'Fiesta Neon — Cliente Demo',
    slug: 'fiesta-neon-cliente-demo',
    description: 'Noche de electrónica y luces neon. Evento demo para probar Entradas / Compras.',
    startDate: '2026-10-22 23:00:00',
    endDate: '2026-10-23 06:00:00',
    venueName: 'Club Demo Palermo',
    venueAddress: 'Honduras 4800',
    venueCity: 'Buenos Aires',
    venuePostalCode: '1414',
    maxCapacity: 800,
    posterSeed: 'cliente-neon',
    ticketTypes: [
      {
        uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b2a1',
        name: 'General',
        price: '18000.00',
        quantity: 500,
        sortOrder: 0
      },
      {
        uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b2a2',
        name: 'VIP',
        price: '32000.00',
        quantity: 100,
        sortOrder: 1
      }
    ]
  },
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b202',
    name: 'Jazz al Atardecer — Cliente Demo',
    slug: 'jazz-atardecer-cliente-demo',
    description: 'Set acústico al aire libre. Evento próximo de demo.',
    startDate: '2026-11-15 18:30:00',
    endDate: '2026-11-15 22:00:00',
    venueName: 'Parque Demo',
    venueAddress: 'Av. Libertador 3500',
    venueCity: 'Buenos Aires',
    venuePostalCode: '1425',
    maxCapacity: 400,
    posterSeed: 'cliente-jazz',
    ticketTypes: [
      {
        uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b2a3',
        name: 'Platea',
        price: '12500.00',
        quantity: 300,
        sortOrder: 0
      }
    ]
  },
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b203',
    name: 'Rock Fest Retro — Cliente Demo',
    slug: 'rock-fest-retro-cliente-demo',
    description: 'Festival ya finalizado. Sirve para Entradas usadas / pasadas.',
    startDate: '2026-07-12 16:00:00',
    endDate: '2026-07-12 23:30:00',
    venueName: 'Estadio Demo',
    venueAddress: 'Av. Figueroa Alcorta 7500',
    venueCity: 'Buenos Aires',
    venuePostalCode: '1428',
    maxCapacity: 5000,
    posterSeed: 'cliente-rock',
    ticketTypes: [
      {
        uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b2a4',
        name: 'Campo',
        price: '22000.00',
        quantity: 3000,
        sortOrder: 0
      }
    ]
  },
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b204',
    name: 'Stand Up Noche — Cliente Demo',
    slug: 'stand-up-noche-cliente-demo',
    description: 'Función pasada de comedy. Entradas usadas y canceladas.',
    startDate: '2026-08-20 21:00:00',
    endDate: '2026-08-20 23:00:00',
    venueName: 'Teatro Demo',
    venueAddress: 'Corrientes 1200',
    venueCity: 'Buenos Aires',
    venuePostalCode: '1043',
    maxCapacity: 250,
    posterSeed: 'cliente-standup',
    ticketTypes: [
      {
        uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b2a5',
        name: 'General',
        price: '9500.00',
        quantity: 220,
        sortOrder: 0
      }
    ]
  }
];

type SeedOrder = {
  uuid: string;
  orderNumber: string;
  eventUuid: string;
  status: 'pending_payment' | 'paid' | 'cancelled' | 'expired' | 'refunded';
  subtotal: string;
  serviceFee: string;
  total: string;
  daysAgo: number;
  paidAt: string | null;
  expiresAtOffsetHours: number;
  paymentProvider: string | null;
  paymentId: string | null;
  paymentMethod: string | null;
  items: Array<{
    uuid: string;
    ticketTypeUuid: string;
    quantity: number;
    unitPrice: string;
    subtotal: string;
    tickets?: Array<{
      uuid: string;
      ticketNumber: string;
      status: 'active' | 'used' | 'cancelled';
      checkedInAt: string | null;
      qrCode: string | null;
    }>;
  }>;
};

const DEMO_ORDERS: SeedOrder[] = [
  // ——— Pagadas (próximas) ———
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b301',
    orderNumber: 'ORD-DEMO-C001',
    eventUuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b201',
    status: 'paid',
    subtotal: '36000.00',
    serviceFee: '5400.00',
    total: '41400.00',
    daysAgo: 2,
    paidAt: 'DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 2 DAY)',
    expiresAtOffsetHours: -47,
    paymentProvider: 'mercadopago',
    paymentId: 'mp-demo-c001',
    paymentMethod: 'credit_card',
    items: [
      {
        uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b401',
        ticketTypeUuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b2a1',
        quantity: 2,
        unitPrice: '18000.00',
        subtotal: '36000.00',
        tickets: [
          {
            uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b501',
            ticketNumber: 'TKT-DEMO-C001-01',
            status: 'active',
            checkedInAt: null,
            qrCode: 'demo-qr-c001-01'
          },
          {
            uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b502',
            ticketNumber: 'TKT-DEMO-C001-02',
            status: 'active',
            checkedInAt: null,
            qrCode: 'demo-qr-c001-02'
          }
        ]
      }
    ]
  },
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b302',
    orderNumber: 'ORD-DEMO-C002',
    eventUuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b201',
    status: 'paid',
    subtotal: '32000.00',
    serviceFee: '4800.00',
    total: '36800.00',
    daysAgo: 5,
    paidAt: 'DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 5 DAY)',
    expiresAtOffsetHours: -119,
    paymentProvider: 'mercadopago',
    paymentId: 'mp-demo-c002',
    paymentMethod: 'account_money',
    items: [
      {
        uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b402',
        ticketTypeUuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b2a2',
        quantity: 1,
        unitPrice: '32000.00',
        subtotal: '32000.00',
        tickets: [
          {
            uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b503',
            ticketNumber: 'TKT-DEMO-C002-01',
            status: 'active',
            checkedInAt: null,
            qrCode: 'demo-qr-c002-01'
          }
        ]
      }
    ]
  },
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b303',
    orderNumber: 'ORD-DEMO-C003',
    eventUuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b202',
    status: 'paid',
    subtotal: '37500.00',
    serviceFee: '5625.00',
    total: '43125.00',
    daysAgo: 8,
    paidAt: 'DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 8 DAY)',
    expiresAtOffsetHours: -191,
    paymentProvider: 'mercadopago',
    paymentId: 'mp-demo-c003',
    paymentMethod: 'debit_card',
    items: [
      {
        uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b403',
        ticketTypeUuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b2a3',
        quantity: 3,
        unitPrice: '12500.00',
        subtotal: '37500.00',
        tickets: [
          {
            uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b504',
            ticketNumber: 'TKT-DEMO-C003-01',
            status: 'active',
            checkedInAt: null,
            qrCode: 'demo-qr-c003-01'
          },
          {
            uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b505',
            ticketNumber: 'TKT-DEMO-C003-02',
            status: 'active',
            checkedInAt: null,
            qrCode: 'demo-qr-c003-02'
          },
          {
            uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b506',
            ticketNumber: 'TKT-DEMO-C003-03',
            status: 'active',
            checkedInAt: null,
            qrCode: 'demo-qr-c003-03'
          }
        ]
      }
    ]
  },
  // ——— Pagadas (pasadas / usadas) ———
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b304',
    orderNumber: 'ORD-DEMO-C004',
    eventUuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b203',
    status: 'paid',
    subtotal: '44000.00',
    serviceFee: '6600.00',
    total: '50600.00',
    daysAgo: 60,
    paidAt: 'DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 60 DAY)',
    expiresAtOffsetHours: -1439,
    paymentProvider: 'mercadopago',
    paymentId: 'mp-demo-c004',
    paymentMethod: 'credit_card',
    items: [
      {
        uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b404',
        ticketTypeUuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b2a4',
        quantity: 2,
        unitPrice: '22000.00',
        subtotal: '44000.00',
        tickets: [
          {
            uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b507',
            ticketNumber: 'TKT-DEMO-C004-01',
            status: 'used',
            checkedInAt: '2026-07-12 17:15:00',
            qrCode: 'demo-qr-c004-01'
          },
          {
            uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b508',
            ticketNumber: 'TKT-DEMO-C004-02',
            status: 'used',
            checkedInAt: '2026-07-12 17:20:00',
            qrCode: 'demo-qr-c004-02'
          }
        ]
      }
    ]
  },
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b305',
    orderNumber: 'ORD-DEMO-C005',
    eventUuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b204',
    status: 'paid',
    subtotal: '19000.00',
    serviceFee: '2850.00',
    total: '21850.00',
    daysAgo: 40,
    paidAt: 'DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 40 DAY)',
    expiresAtOffsetHours: -959,
    paymentProvider: 'mercadopago',
    paymentId: 'mp-demo-c005',
    paymentMethod: 'account_money',
    items: [
      {
        uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b405',
        ticketTypeUuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b2a5',
        quantity: 2,
        unitPrice: '9500.00',
        subtotal: '19000.00',
        tickets: [
          {
            uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b509',
            ticketNumber: 'TKT-DEMO-C005-01',
            status: 'used',
            checkedInAt: '2026-08-20 20:40:00',
            qrCode: 'demo-qr-c005-01'
          },
          {
            uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b50a',
            ticketNumber: 'TKT-DEMO-C005-02',
            status: 'cancelled',
            checkedInAt: null,
            qrCode: 'demo-qr-c005-02'
          }
        ]
      }
    ]
  },
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b306',
    orderNumber: 'ORD-DEMO-C006',
    eventUuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b201',
    status: 'paid',
    subtotal: '54000.00',
    serviceFee: '8100.00',
    total: '62100.00',
    daysAgo: 1,
    paidAt: 'DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 1 DAY)',
    expiresAtOffsetHours: -23,
    paymentProvider: 'mercadopago',
    paymentId: 'mp-demo-c006',
    paymentMethod: 'credit_card',
    items: [
      {
        uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b406',
        ticketTypeUuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b2a1',
        quantity: 3,
        unitPrice: '18000.00',
        subtotal: '54000.00',
        tickets: [
          {
            uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b50b',
            ticketNumber: 'TKT-DEMO-C006-01',
            status: 'active',
            checkedInAt: null,
            qrCode: 'demo-qr-c006-01'
          },
          {
            uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b50c',
            ticketNumber: 'TKT-DEMO-C006-02',
            status: 'active',
            checkedInAt: null,
            qrCode: 'demo-qr-c006-02'
          },
          {
            uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b50d',
            ticketNumber: 'TKT-DEMO-C006-03',
            status: 'active',
            checkedInAt: null,
            qrCode: 'demo-qr-c006-03'
          }
        ]
      }
    ]
  },
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b307',
    orderNumber: 'ORD-DEMO-C007',
    eventUuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b202',
    status: 'paid',
    subtotal: '25000.00',
    serviceFee: '3750.00',
    total: '28750.00',
    daysAgo: 12,
    paidAt: 'DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 12 DAY)',
    expiresAtOffsetHours: -287,
    paymentProvider: 'mercadopago',
    paymentId: 'mp-demo-c007',
    paymentMethod: 'debit_card',
    items: [
      {
        uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b407',
        ticketTypeUuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b2a3',
        quantity: 2,
        unitPrice: '12500.00',
        subtotal: '25000.00',
        tickets: [
          {
            uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b50e',
            ticketNumber: 'TKT-DEMO-C007-01',
            status: 'active',
            checkedInAt: null,
            qrCode: 'demo-qr-c007-01'
          },
          {
            uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b50f',
            ticketNumber: 'TKT-DEMO-C007-02',
            status: 'active',
            checkedInAt: null,
            qrCode: 'demo-qr-c007-02'
          }
        ]
      }
    ]
  },
  // ——— Sin tickets (estados no pagados) ———
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b308',
    orderNumber: 'ORD-DEMO-C008',
    eventUuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b201',
    status: 'pending_payment',
    subtotal: '18000.00',
    serviceFee: '2700.00',
    total: '20700.00',
    daysAgo: 0,
    paidAt: null,
    expiresAtOffsetHours: 1,
    paymentProvider: null,
    paymentId: null,
    paymentMethod: null,
    items: [
      {
        uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b408',
        ticketTypeUuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b2a1',
        quantity: 1,
        unitPrice: '18000.00',
        subtotal: '18000.00'
      }
    ]
  },
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b309',
    orderNumber: 'ORD-DEMO-C009',
    eventUuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b202',
    status: 'cancelled',
    subtotal: '12500.00',
    serviceFee: '1875.00',
    total: '14375.00',
    daysAgo: 3,
    paidAt: null,
    expiresAtOffsetHours: -71,
    paymentProvider: null,
    paymentId: null,
    paymentMethod: null,
    items: [
      {
        uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b409',
        ticketTypeUuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b2a3',
        quantity: 1,
        unitPrice: '12500.00',
        subtotal: '12500.00'
      }
    ]
  },
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b30a',
    orderNumber: 'ORD-DEMO-C010',
    eventUuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b204',
    status: 'expired',
    subtotal: '9500.00',
    serviceFee: '1425.00',
    total: '10925.00',
    daysAgo: 15,
    paidAt: null,
    expiresAtOffsetHours: -359,
    paymentProvider: null,
    paymentId: null,
    paymentMethod: null,
    items: [
      {
        uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b40a',
        ticketTypeUuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b2a5',
        quantity: 1,
        unitPrice: '9500.00',
        subtotal: '9500.00'
      }
    ]
  },
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b30b',
    orderNumber: 'ORD-DEMO-C011',
    eventUuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b203',
    status: 'refunded',
    subtotal: '22000.00',
    serviceFee: '3300.00',
    total: '25300.00',
    daysAgo: 55,
    paidAt: 'DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 55 DAY)',
    expiresAtOffsetHours: -1319,
    paymentProvider: 'mercadopago',
    paymentId: 'mp-demo-c011',
    paymentMethod: 'credit_card',
    items: [
      {
        uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b40b',
        ticketTypeUuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b2a4',
        quantity: 1,
        unitPrice: '22000.00',
        subtotal: '22000.00',
        tickets: [
          {
            uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b510',
            ticketNumber: 'TKT-DEMO-C011-01',
            status: 'cancelled',
            checkedInAt: null,
            qrCode: 'demo-qr-c011-01'
          }
        ]
      }
    ]
  },
  // Extra paid order para llegar a ~20 entradas
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b30c',
    orderNumber: 'ORD-DEMO-C012',
    eventUuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b201',
    status: 'paid',
    subtotal: '72000.00',
    serviceFee: '10800.00',
    total: '82800.00',
    daysAgo: 4,
    paidAt: 'DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 4 DAY)',
    expiresAtOffsetHours: -95,
    paymentProvider: 'mercadopago',
    paymentId: 'mp-demo-c012',
    paymentMethod: 'credit_card',
    items: [
      {
        uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b40c',
        ticketTypeUuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b2a1',
        quantity: 4,
        unitPrice: '18000.00',
        subtotal: '72000.00',
        tickets: [
          {
            uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b511',
            ticketNumber: 'TKT-DEMO-C012-01',
            status: 'active',
            checkedInAt: null,
            qrCode: 'demo-qr-c012-01'
          },
          {
            uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b512',
            ticketNumber: 'TKT-DEMO-C012-02',
            status: 'active',
            checkedInAt: null,
            qrCode: 'demo-qr-c012-02'
          },
          {
            uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b513',
            ticketNumber: 'TKT-DEMO-C012-03',
            status: 'active',
            checkedInAt: null,
            qrCode: 'demo-qr-c012-03'
          },
          {
            uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b514',
            ticketNumber: 'TKT-DEMO-C012-04',
            status: 'active',
            checkedInAt: null,
            qrCode: 'demo-qr-c012-04'
          }
        ]
      }
    ]
  }
];

const DEMO_NOTIFICATIONS: Array<{
  uuid: string;
  title: string;
  body: string;
  readAt: string | null;
  minutesAgo: number;
}> = [
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b601',
    title: '¡Pago confirmado!',
    body: 'Tu compra ORD-DEMO-C001 ya está acreditada. Revisá tus entradas en Entradas.',
    readAt: null,
    minutesAgo: 30
  },
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b602',
    title: 'Entradas listas',
    body: 'Los PDF y QR de Fiesta Neon ya están disponibles para descargar.',
    readAt: null,
    minutesAgo: 90
  },
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b603',
    title: 'Recordatorio de evento',
    body: 'Jazz al Atardecer es en noviembre. Guardá la fecha y llegá con tiempo.',
    readAt: null,
    minutesAgo: 180
  },
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b604',
    title: 'Orden pendiente de pago',
    body: 'Tenés una compra pendiente. Completá el pago antes de que expire la reserva.',
    readAt: null,
    minutesAgo: 240
  },
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b605',
    title: 'Compra cancelada',
    body: 'Cancelaste la orden ORD-DEMO-C009. El stock fue liberado.',
    readAt: 'DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 2 DAY)',
    minutesAgo: 60 * 24 * 3
  },
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b606',
    title: 'Orden expirada',
    body: 'La reserva ORD-DEMO-C010 venció sin pago. Podés volver a comprar cuando quieras.',
    readAt: 'DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 10 DAY)',
    minutesAgo: 60 * 24 * 15
  },
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b607',
    title: 'Reembolso procesado',
    body: 'Devolvimos el total de ORD-DEMO-C011 a tu medio de pago. Puede demorar hasta 10 días hábiles.',
    readAt: null,
    minutesAgo: 60 * 24 * 50
  },
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b608',
    title: 'Check-in exitoso',
    body: 'Tu entrada de Rock Fest Retro fue validada en puerta. ¡Que disfrutes el show!',
    readAt: 'DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 55 DAY)',
    minutesAgo: 60 * 24 * 55
  },
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b609',
    title: 'Cambio de horario',
    body: 'Fiesta Neon abre puertas 30 minutos antes. Actualizá tu agenda.',
    readAt: null,
    minutesAgo: 60 * 6
  },
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b60a',
    title: 'Nueva compra registrada',
    body: 'Compraste 3 entradas General para Fiesta Neon. Monto total $62.100.',
    readAt: null,
    minutesAgo: 60 * 26
  },
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b60b',
    title: 'PDF disponible',
    body: 'Ya podés descargar el PDF de tus entradas de Jazz al Atardecer.',
    readAt: 'DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 1 DAY)',
    minutesAgo: 60 * 24 * 8
  },
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b60c',
    title: 'Transferencia recibida',
    body: 'Te asignaron una entrada adicional en tu cuenta. Revisá la sección Entradas.',
    readAt: null,
    minutesAgo: 60 * 12
  },
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b60d',
    title: 'Evento por comenzar',
    body: 'Stand Up Noche ya pasó. Si no fuiste, contactá soporte por reprogramaciones.',
    readAt: 'DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 20 DAY)',
    minutesAgo: 60 * 24 * 30
  },
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b60e',
    title: 'Promoción disponible',
    body: 'Hay preventa VIP para Fiesta Neon. Mirá las tandas antes de que se agoten.',
    readAt: null,
    minutesAgo: 60 * 48
  },
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b60f',
    title: 'Bienvenido de nuevo',
    body: 'Volviste a comprar. Tus entradas quedan guardadas en la app para el día del evento.',
    readAt: 'DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 3 HOUR)',
    minutesAgo: 60 * 4
  },
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b610',
    title: 'Actualización de venue',
    body: 'Jazz al Atardecer mantiene el mismo parque; el acceso será por la entrada norte.',
    readAt: null,
    minutesAgo: 60 * 36
  },
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b611',
    title: 'Compra VIP confirmada',
    body: 'Tu entrada VIP para Fiesta Neon incluye acceso preferencial y barra dedicada.',
    readAt: 'DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 4 DAY)',
    minutesAgo: 60 * 24 * 5
  },
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b612',
    title: 'Resumen semanal',
    body: 'Esta semana sumaste nuevas entradas. Abrí Compras para ver el historial completo.',
    readAt: null,
    minutesAgo: 60 * 20
  },
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b613',
    title: 'Soporte respondió',
    body: 'Respondimos tu consulta sobre el PDF de Rock Fest. Revisá tu correo.',
    readAt: 'DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 45 DAY)',
    minutesAgo: 60 * 24 * 48
  },
  {
    uuid: 'a73715f3-3c19-42f7-afb3-e5fa4513b614',
    title: '¡Gracias por tu compra!',
    body: 'Compraste 4 entradas más para Fiesta Neon. Las vas a ver juntas en Entradas.',
    readAt: null,
    minutesAgo: 60 * 24 * 4
  }
];

function bannerUrl(seed: string): string {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}-banner/1600/900`;
}

export class SeedClientDemoTicketsOrdersNotifications1785930000000 implements MigrationInterface {
  name = 'SeedClientDemoTicketsOrdersNotifications1785930000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const users: Array<{ uuid: string }> = await queryRunner.query(
      `SELECT \`uuid\` FROM \`user\` WHERE \`uuid\` = ? AND \`isDeleted\` IS NULL LIMIT 1`,
      [TARGET_USER_UUID]
    );
    if (users.length === 0) return;

    const orgs: Array<{ uuid: string }> = await queryRunner.query(
      `SELECT \`uuid\` FROM \`organization\` WHERE \`isDeleted\` IS NULL ORDER BY \`createdAt\` ASC LIMIT 1`
    );
    const organizationUuid = orgs[0]?.uuid as string | undefined;
    if (!organizationUuid) return;

    // 1) Eventos + tandas
    for (const event of DEMO_EVENTS) {
      const existing: Array<{ uuid: string }> = await queryRunner.query(
        `SELECT \`uuid\` FROM \`event\` WHERE \`uuid\` = ? LIMIT 1`,
        [event.uuid]
      );
      if (existing.length > 0) continue;

      const banner = bannerUrl(event.posterSeed);
      const bannerImages = JSON.stringify({ desktop: banner, mobile: banner, thumbnail: banner });

      await queryRunner.query(
        `
          INSERT INTO \`event\` (
            \`uuid\`, \`name\`, \`description\`, \`slug\`, \`bannerUrl\`, \`bannerImages\`,
            \`startDate\`, \`endDate\`, \`saleStartDate\`, \`saleEndDate\`,
            \`isPublished\`, \`publishedAt\`, \`cancelledAt\`, \`cancellationReason\`, \`salesClosedAt\`,
            \`isActive\`, \`organizationUuid\`,
            \`venueName\`, \`venueAddress\`, \`venueCity\`, \`venueCountry\`, \`venuePostalCode\`,
            \`googleMapsUrl\`, \`lineup\`, \`maxCapacity\`
          ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, NULL, NULL,
            1, DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 30 DAY), NULL, NULL, NULL,
            1, ?,
            ?, ?, ?, 'Argentina', ?,
            NULL, NULL, ?
          )
        `,
        [
          event.uuid,
          event.name,
          event.description,
          event.slug,
          banner,
          bannerImages,
          event.startDate,
          event.endDate,
          organizationUuid,
          event.venueName,
          event.venueAddress,
          event.venueCity,
          event.venuePostalCode,
          event.maxCapacity
        ]
      );

      for (const tt of event.ticketTypes) {
        await queryRunner.query(
          `
            INSERT INTO \`ticket_type\` (
              \`uuid\`, \`eventUuid\`, \`name\`, \`description\`, \`price\`, \`currency\`,
              \`quantity\`, \`availableQuantity\`, \`minPerOrder\`, \`maxPerOrder\`,
              \`saleStartDate\`, \`saleEndDate\`, \`isActive\`, \`sortOrder\`
            ) VALUES (
              ?, ?, ?, NULL, ?, 'ARS',
              ?, ?, 1, 8,
              NULL, NULL, 1, ?
            )
          `,
          [tt.uuid, event.uuid, tt.name, tt.price, tt.quantity, tt.quantity, tt.sortOrder]
        );
      }
    }

    // 2) Órdenes + items + tickets
    for (const order of DEMO_ORDERS) {
      const existing: Array<{ uuid: string }> = await queryRunner.query(
        `SELECT \`uuid\` FROM \`orders\` WHERE \`uuid\` = ? LIMIT 1`,
        [order.uuid]
      );
      if (existing.length > 0) continue;

      const paidAtSql = order.paidAt === null ? 'NULL' : order.paidAt;

      await queryRunner.query(
        `
          INSERT INTO \`orders\` (
            \`uuid\`, \`orderNumber\`, \`userUuid\`, \`eventUuid\`, \`status\`,
            \`subtotal\`, \`serviceFee\`, \`total\`, \`couponUuid\`, \`discountAmount\`,
            \`currency\`, \`paymentProvider\`, \`paymentId\`, \`paymentMethod\`,
            \`paidAt\`, \`expiresAt\`, \`metadata\`, \`createdAt\`, \`updatedAt\`
          ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?, NULL, 0,
            'ARS', ?, ?, ?,
            ${paidAtSql},
            DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL ? HOUR),
            NULL,
            DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL ? DAY),
            CURRENT_TIMESTAMP(3)
          )
        `,
        [
          order.uuid,
          order.orderNumber,
          TARGET_USER_UUID,
          order.eventUuid,
          order.status,
          order.subtotal,
          order.serviceFee,
          order.total,
          order.paymentProvider,
          order.paymentId,
          order.paymentMethod,
          order.expiresAtOffsetHours,
          order.daysAgo
        ]
      );

      for (const item of order.items) {
        await queryRunner.query(
          `
            INSERT INTO \`order_item\` (
              \`uuid\`, \`orderUuid\`, \`ticketTypeUuid\`, \`quantity\`, \`unitPrice\`, \`subtotal\`
            ) VALUES (?, ?, ?, ?, ?, ?)
          `,
          [item.uuid, order.uuid, item.ticketTypeUuid, item.quantity, item.unitPrice, item.subtotal]
        );

        for (const ticket of item.tickets ?? []) {
          const checkedInSql = ticket.checkedInAt === null ? 'NULL' : `'${ticket.checkedInAt}'`;
          await queryRunner.query(
            `
              INSERT INTO \`ticket\` (
                \`uuid\`, \`orderItemUuid\`, \`userUuid\`, \`eventUuid\`, \`ticketTypeUuid\`,
                \`ticketNumber\`, \`qrCode\`, \`qrUrl\`, \`pdfUrl\`, \`status\`,
                \`checkedInAt\`, \`checkedInBy\`, \`createdAt\`, \`updatedAt\`
              ) VALUES (
                ?, ?, ?, ?, ?,
                ?, ?, NULL, NULL, ?,
                ${checkedInSql}, NULL,
                DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL ? DAY),
                CURRENT_TIMESTAMP(3)
              )
            `,
            [
              ticket.uuid,
              item.uuid,
              TARGET_USER_UUID,
              order.eventUuid,
              item.ticketTypeUuid,
              ticket.ticketNumber,
              ticket.qrCode,
              ticket.status,
              order.daysAgo
            ]
          );
        }
      }
    }

    // 3) Notificaciones
    for (const row of DEMO_NOTIFICATIONS) {
      const readAtSql = row.readAt === null ? 'NULL' : row.readAt;
      await queryRunner.query(
        `
          INSERT INTO \`user_notification\`
            (\`uuid\`, \`userUuid\`, \`title\`, \`body\`, \`readAt\`, \`isDeleted\`, \`createdAt\`, \`updatedAt\`)
          SELECT
            ?,
            ?,
            ?,
            ?,
            ${readAtSql},
            NULL,
            DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL ? MINUTE),
            CURRENT_TIMESTAMP(3)
          FROM DUAL
          WHERE NOT EXISTS (
            SELECT 1 FROM \`user_notification\` n WHERE n.\`uuid\` = ?
          )
        `,
        [row.uuid, TARGET_USER_UUID, row.title, row.body, row.minutesAgo, row.uuid]
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const ticketUuids = DEMO_ORDERS.flatMap(o =>
      o.items.flatMap(i => (i.tickets ?? []).map(t => t.uuid))
    );
    const itemUuids = DEMO_ORDERS.flatMap(o => o.items.map(i => i.uuid));
    const orderUuids = DEMO_ORDERS.map(o => o.uuid);
    const notificationUuids = DEMO_NOTIFICATIONS.map(n => n.uuid);
    const ticketTypeUuids = DEMO_EVENTS.flatMap(e => e.ticketTypes.map(t => t.uuid));
    const eventUuids = DEMO_EVENTS.map(e => e.uuid);

    if (ticketUuids.length > 0) {
      await queryRunner.query(
        `DELETE FROM \`ticket\` WHERE \`uuid\` IN (${ticketUuids.map(() => '?').join(', ')})`,
        ticketUuids
      );
    }
    if (itemUuids.length > 0) {
      await queryRunner.query(
        `DELETE FROM \`order_item\` WHERE \`uuid\` IN (${itemUuids.map(() => '?').join(', ')})`,
        itemUuids
      );
    }
    if (orderUuids.length > 0) {
      await queryRunner.query(
        `DELETE FROM \`orders\` WHERE \`uuid\` IN (${orderUuids.map(() => '?').join(', ')})`,
        orderUuids
      );
    }
    if (notificationUuids.length > 0) {
      await queryRunner.query(
        `DELETE FROM \`user_notification\` WHERE \`uuid\` IN (${notificationUuids.map(() => '?').join(', ')})`,
        notificationUuids
      );
    }
    if (ticketTypeUuids.length > 0) {
      await queryRunner.query(
        `DELETE FROM \`ticket_type\` WHERE \`uuid\` IN (${ticketTypeUuids.map(() => '?').join(', ')})`,
        ticketTypeUuids
      );
    }
    if (eventUuids.length > 0) {
      await queryRunner.query(
        `DELETE FROM \`event\` WHERE \`uuid\` IN (${eventUuids.map(() => '?').join(', ')})`,
        eventUuids
      );
    }
  }
}
