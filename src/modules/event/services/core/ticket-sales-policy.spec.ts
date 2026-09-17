import {
  getTicketSalesStatus,
  selectCurrentTicketType,
  selectNextUpcomingTicketType,
  TicketSalesCandidate
} from './ticket-sales-policy';

describe('ticket sales policy', () => {
  const now = new Date('2026-09-16T18:00:00.000Z');
  const ticket = (patch: Partial<TicketSalesCandidate> & Pick<TicketSalesCandidate, 'uuid'>): TicketSalesCandidate => ({
    isActive: true,
    salesEnabled: true,
    availableQuantity: 100,
    saleStartDate: null,
    saleEndDate: null,
    sortOrder: 0,
    ...patch
  });

  it('distingue pausa, programación, agotamiento y cierre', () => {
    expect(getTicketSalesStatus(ticket({ uuid: 'disabled', salesEnabled: false }), now)).toBe('disabled');
    expect(getTicketSalesStatus(ticket({ uuid: 'upcoming', saleStartDate: '2026-09-17T18:00:00.000Z' }), now)).toBe(
      'upcoming'
    );
    expect(getTicketSalesStatus(ticket({ uuid: 'sold', availableQuantity: 0 }), now)).toBe('sold_out');
    expect(getTicketSalesStatus(ticket({ uuid: 'expired', saleEndDate: '2026-09-16T17:59:59.000Z' }), now)).toBe(
      'expired'
    );
  });

  it('elige la ventana abierta más reciente y usa sortOrder para empates', () => {
    const first = ticket({
      uuid: 'first',
      saleStartDate: '2026-09-01T00:00:00.000Z',
      sortOrder: 0
    });
    const second = ticket({
      uuid: 'second',
      saleStartDate: '2026-09-15T00:00:00.000Z',
      sortOrder: 2
    });
    const tied = ticket({
      uuid: 'tied',
      saleStartDate: '2026-09-15T00:00:00.000Z',
      sortOrder: 1
    });

    expect(selectCurrentTicketType([first, second, tied], now)?.uuid).toBe('tied');
  });

  it('salta agotadas y desactivadas sin adelantar una tanda futura', () => {
    const sold = ticket({ uuid: 'sold', availableQuantity: 0 });
    const disabled = ticket({ uuid: 'disabled', salesEnabled: false });
    const future = ticket({
      uuid: 'future',
      saleStartDate: '2026-09-20T00:00:00.000Z'
    });

    expect(selectCurrentTicketType([sold, disabled, future], now)).toBeNull();
    expect(selectNextUpcomingTicketType([sold, disabled, future], now)?.uuid).toBe('future');
  });
});
