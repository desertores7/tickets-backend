import { UnprocessableEntityException } from '@nestjs/common';
import { OrderService } from './order.service';

describe('OrderService ticket sales state', () => {
  it('rechaza una tanda pausada antes de reservar stock', async () => {
    const dbRepository = {
      findOne: jest.fn(async ({ entity }: { entity: string }) => {
        if (entity === 'user') {
          return { uuid: 'user-1', documentType: 'DNI', dni: '12345678' };
        }
        if (entity === 'event') {
          return {
            uuid: 'event-1',
            isActive: true,
            isPublished: true,
            endDate: new Date(Date.now() + 86_400_000),
            saleStartDate: null,
            saleEndDate: null,
            salesClosedAt: null,
            cancelledAt: null,
            organization: { active: 1 }
          };
        }
        if (entity === 'ticket_type') {
          return {
            uuid: 'ticket-1',
            eventUuid: 'event-1',
            name: 'Preventa',
            price: 1000,
            currency: 'ARS',
            quantity: 100,
            availableQuantity: 100,
            minPerOrder: 1,
            maxPerOrder: 10,
            saleStartDate: null,
            saleEndDate: null,
            isActive: true,
            salesEnabled: false,
            sortOrder: 0
          };
        }
        return null;
      }),
      findMany: jest.fn().mockResolvedValue([])
    };
    const stockService = { reserveStock: jest.fn() };
    const service = new OrderService(
      dbRepository as never,
      stockService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { getConfig: jest.fn().mockResolvedValue({ priceThreshold: 1_000_000, highPriceLimit: 1, lowPriceLimit: 5 }) } as never,
      {} as never
    );

    await expect(
      service.createOrder('user-1', {
        eventUuid: 'event-1',
        items: [{ ticketTypeUuid: 'ticket-1', quantity: 1 }]
      })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(stockService.reserveStock).not.toHaveBeenCalled();
  });
});
