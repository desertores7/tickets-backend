import {
  detectEventUpdateChanges,
  formatLineup,
  isRefundWindowOpen,
  lineupEquals,
  resolveOpenRefundWindowEndsAt,
  resolveRefundWindowEndsAt
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

  it('la ventana por defecto es el inicio del evento', () => {
    const start = '2026-10-01T23:00:00.000Z';
    expect(resolveRefundWindowEndsAt(start).toISOString()).toBe(start);
    expect(resolveRefundWindowEndsAt(start, null).toISOString()).toBe(start);
  });

  it('la extensión del Admin solo corre la ventana hacia adelante', () => {
    const start = '2026-10-01T23:00:00.000Z';

    // Posterior al inicio: gana la extensión.
    expect(resolveRefundWindowEndsAt(start, '2026-10-15T00:00:00.000Z').toISOString()).toBe(
      '2026-10-15T00:00:00.000Z'
    );

    // Anterior al inicio: se ignora. Acortar sería quitar un derecho ya dado.
    expect(resolveRefundWindowEndsAt(start, '2026-09-20T00:00:00.000Z').toISOString()).toBe(start);

    // Basura: cae al default en vez de romper.
    expect(resolveRefundWindowEndsAt(start, 'no-es-una-fecha').toISOString()).toBe(start);
  });

  it('isRefundWindowOpen se cierra cuando arranca el evento', () => {
    const start = '2026-10-01T23:00:00.000Z';
    const antes = new Date('2026-10-01T22:59:00.000Z');
    const justo = new Date(start);
    const despues = new Date('2026-10-02T00:00:00.000Z');

    expect(isRefundWindowOpen(start, null, antes)).toBe(true);
    expect(isRefundWindowOpen(start, null, justo)).toBe(false);
    expect(isRefundWindowOpen(start, null, despues)).toBe(false);

    // Con extensión del Admin sigue abierta después del evento: es el caso de
    // la cancelación de último momento.
    expect(isRefundWindowOpen(start, '2026-10-20T00:00:00.000Z', despues)).toBe(true);
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
