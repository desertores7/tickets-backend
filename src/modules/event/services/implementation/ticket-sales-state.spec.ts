import { EventService } from './event.service';

describe('EventService.setTicketTypeSalesState', () => {
  function build(initialEnabled = true) {
    const ticketType = {
      uuid: 'ticket-1',
      eventUuid: 'event-1',
      name: 'Preventa',
      isActive: true,
      salesEnabled: initialEnabled,
      availableQuantity: 80,
      quantity: 100
    };
    const dbRepository = {
      findOne: jest.fn(async ({ entity }: { entity: string }) =>
        entity === 'event'
          ? {
              uuid: 'event-1',
              organizationUuid: 'organization-1',
              isActive: true
            }
          : ticketType
      ),
      update: jest.fn()
    };
    const redisService = { setStock: jest.fn() };
    const service = new EventService(
      dbRepository as never,
      redisService as never,
      { userPermission: jest.fn().mockResolvedValue(true) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );
    return { service, dbRepository, redisService };
  }

  it('pausa la venta sin modificar stock ni Redis', async () => {
    const { service, dbRepository, redisService } = build(true);

    await expect(service.setTicketTypeSalesState('event-1', 'ticket-1', false, 'user-1')).resolves.toEqual(
      expect.objectContaining({ salesEnabled: false })
    );

    expect(dbRepository.update).toHaveBeenCalledWith({
      entity: 'ticket_type',
      where: { uuid: 'ticket-1' },
      data: { salesEnabled: false }
    });
    expect(redisService.setStock).not.toHaveBeenCalled();
  });

  it('reactiva la misma tanda sin tocar sus cantidades', async () => {
    const { service, dbRepository } = build(false);

    const result = await service.setTicketTypeSalesState('event-1', 'ticket-1', true, 'user-1');

    expect(result.availableQuantity).toBe(80);
    expect(result.quantity).toBe(100);
    expect(dbRepository.update).toHaveBeenCalledWith(expect.objectContaining({ data: { salesEnabled: true } }));
  });
});
