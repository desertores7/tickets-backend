import { getTicketTypeSaleWindowError } from './ticket-type-sale-window';

describe('getTicketTypeSaleWindowError', () => {
  // Evento: 21/11 23:00 → 22/11 01:00 (hora argentina).
  const event = { endDate: '2026-11-22T04:00:00.000Z' };

  it('acepta una ventana dentro del evento', () => {
    expect(
      getTicketTypeSaleWindowError(event, {
        saleStartDate: '2026-09-17T03:00:00.000Z',
        saleEndDate: '2026-10-23T03:00:00.000Z'
      })
    ).toBeNull();
  });

  it('acepta que la venta termine justo con el evento', () => {
    expect(getTicketTypeSaleWindowError(event, { saleEndDate: event.endDate })).toBeNull();
  });

  it('rechaza una venta que termina después del fin del evento', () => {
    expect(
      getTicketTypeSaleWindowError(event, { saleEndDate: '2026-11-25T03:00:00.000Z' })
    ).toMatch(/después del fin del evento/);
  });

  it('rechaza una venta que empieza cuando el evento ya terminó', () => {
    expect(
      getTicketTypeSaleWindowError(event, { saleStartDate: '2026-11-23T03:00:00.000Z' })
    ).toMatch(/antes del fin del evento/);
  });

  it('rechaza un fin anterior al inicio', () => {
    expect(
      getTicketTypeSaleWindowError(event, {
        saleStartDate: '2026-10-10T03:00:00.000Z',
        saleEndDate: '2026-10-01T03:00:00.000Z'
      })
    ).toMatch(/posterior a su inicio/);
  });

  it('sin fechas hereda las del evento', () => {
    expect(getTicketTypeSaleWindowError(event, {})).toBeNull();
  });
});
