import {
  computeRefundWindowEndsAt,
  detectEventUpdateChanges,
  formatLineup,
  lineupEquals,
  resolveOpenRefundWindowEndsAt
} from './event-change.helpers';
import { getEventSalesBlockReason } from './event-sales-gate';

describe('event-change.helpers', () => {
  const base = {
    startDate: '2026-10-01T23:00:00.000Z',
    endDate: '2026-10-02T02:00:00.000Z',
    venueName: 'Club A',
    venueAddress: 'Calle 1',
    venueCity: 'CABA',
    venueCountry: 'AR',
    venuePostalCode: '1000',
    googleMapsUrl: null as string | null,
    description: 'Show',
    lineup: ['A', 'B'] as string[] | null
  };

  it('detecta reprogramación como material', () => {
    const groups = detectEventUpdateChanges(base, {
      startDate: new Date('2026-10-08T23:00:00.000Z')
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe('reschedule');
    expect(groups[0].isMaterial).toBe(true);
  });

  it('detecta venue y lineup como materiales; descripción como info', () => {
    const groups = detectEventUpdateChanges(base, {
      venueName: 'Club B',
      lineup: ['A'],
      description: 'Otro texto'
    });
    expect(groups.map(g => g.type).sort()).toEqual(['info', 'lineup', 'venue']);
    expect(groups.find(g => g.type === 'info')?.isMaterial).toBe(false);
    expect(groups.find(g => g.type === 'lineup')?.isMaterial).toBe(true);
  });

  it('computeRefundWindowEndsAt usa 72h o el nuevo inicio si cae antes', () => {
    const notifiedAt = new Date('2026-09-01T12:00:00.000Z');
    const seventyTwo = computeRefundWindowEndsAt(notifiedAt, null);
    expect(seventyTwo.toISOString()).toBe('2026-09-04T12:00:00.000Z');

    const earlyStart = new Date('2026-09-02T12:00:00.000Z');
    expect(computeRefundWindowEndsAt(notifiedAt, earlyStart).toISOString()).toBe(
      earlyStart.toISOString()
    );
  });

  it('resolveOpenRefundWindowEndsAt toma la ventana abierta más lejana', () => {
    const now = new Date('2026-09-02T00:00:00.000Z');
    const open = resolveOpenRefundWindowEndsAt(
      ['2026-09-01T00:00:00.000Z', '2026-09-05T00:00:00.000Z', '2026-09-03T00:00:00.000Z'],
      now
    );
    expect(open?.toISOString()).toBe('2026-09-05T00:00:00.000Z');
    expect(resolveOpenRefundWindowEndsAt(['2026-09-01T00:00:00.000Z'], now)).toBeNull();
  });

  it('lineupEquals / formatLineup normalizan', () => {
    expect(lineupEquals([' A ', 'B'], ['A', 'B'])).toBe(true);
    expect(formatLineup(['A', 'B'])).toBe('A, B');
    expect(formatLineup([])).toBeNull();
  });
});

describe('getEventSalesBlockReason (BR-EVENT-013)', () => {
  const futureEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  it('bloquea si cancelado', () => {
    expect(
      getEventSalesBlockReason({
        endDate: futureEnd,
        cancelledAt: new Date()
      })
    ).toMatch(/cancelado/i);
  });

  it('bloquea si salesClosedAt pasado', () => {
    expect(
      getEventSalesBlockReason({
        endDate: futureEnd,
        salesClosedAt: new Date(Date.now() - 1000)
      })
    ).toMatch(/cerrada/i);
  });

  it('bloquea si endDate ya pasó aunque salesClosedAt sea null', () => {
    expect(
      getEventSalesBlockReason({
        endDate: new Date(Date.now() - 60_000),
        salesClosedAt: null
      })
    ).toMatch(/finalizó/i);
  });

  it('permite compra con evento vigente', () => {
    expect(
      getEventSalesBlockReason({
        endDate: futureEnd,
        salesClosedAt: null,
        cancelledAt: null
      })
    ).toBeNull();
  });
});
