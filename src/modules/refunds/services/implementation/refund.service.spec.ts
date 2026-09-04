import { RefundService } from './refund.service';
import { TicketStatus } from '@config/db/entities/tickets/ticket.entity';
import { OrderStatus } from '@config/db/entities/tickets/order.entity';
import { resolveRefundWindowEndsAt } from '@modules/event/services/core/event-change.helpers';

/**
 * Se prueban las decisiones, no la base: qué se puede pedir, qué se rechaza y
 * cómo se traduce la respuesta de Mercado Pago.
 */
describe('RefundService', () => {
  const build = (overrides: Partial<Record<string, unknown>> = {}) => {
    const service = new RefundService(
      overrides.dbRepository as never,
      overrides.dataSource as never,
      { get: () => '' } as never,
      { sendTemplateEmail: jest.fn() } as never,
      { userPermission: jest.fn().mockResolvedValue(false) } as never
    );
    return service as unknown as Record<string, (...args: unknown[]) => unknown>;
  };

  describe('blockedReason', () => {
    const base = {
      ticketUuid: 't1',
      ticketNumber: 'TK-1',
      ticketTypeName: 'General',
      unitPrice: '1000',
      status: TicketStatus.ACTIVE,
      activeRequest: null
    };

    it('una entrada activa y sin solicitud está disponible', () => {
      expect(build().blockedReason(base)).toBeNull();
    });

    it('una entrada ya reembolsada no se puede volver a pedir', () => {
      expect(build().blockedReason({ ...base, activeRequest: 'refunded' })).toBe(
        'Ya fue reembolsada'
      );
    });

    it('una solicitud en curso bloquea la entrada', () => {
      for (const estado of ['pending', 'approved', 'processing']) {
        expect(build().blockedReason({ ...base, activeRequest: estado })).toBe(
          'Ya tiene una solicitud en curso'
        );
      }
    });

    it('una entrada usada no se reembolsa', () => {
      expect(build().blockedReason({ ...base, status: TicketStatus.USED })).toBe(
        'Ya se usó para entrar'
      );
    });

    it('una entrada transferida es de otra persona', () => {
      expect(build().blockedReason({ ...base, status: TicketStatus.TRANSFERRED })).toBe(
        'Fue transferida a otra persona'
      );
    });

    it('tras un rechazo la entrada vuelve a estar disponible', () => {
      // `rejected` y `failed` no entran en REFUND_ACTIVE_STATUSES, así que el
      // LEFT JOIN no los trae y `activeRequest` queda en null.
      expect(build().blockedReason({ ...base, activeRequest: null })).toBeNull();
    });
  });

  describe('la ventana manda sobre la elegibilidad', () => {
    const evento = { uuid: 'e1', name: 'Show', startDate: '2026-10-01T23:00:00.000Z' };

    const armar = (opts: {
      orderStatus: OrderStatus;
      hasMaterialChange: boolean;
      extendedTo?: string | null;
      ahora: Date;
    }) => {
      const service = build({
        dbRepository: {
          findOne: jest.fn(async ({ entity }: { entity: string }) =>
            entity === 'orders'
              ? { uuid: 'o1', userUuid: 'u1', eventUuid: 'e1', status: opts.orderStatus }
              : { ...evento, refundWindowExtendedTo: opts.extendedTo ?? null }
          )
        }
      });
      service.loadTickets = jest.fn().mockResolvedValue([
        {
          ticketUuid: 't1',
          ticketNumber: 'TK-1',
          ticketTypeName: 'General',
          unitPrice: '1500',
          status: TicketStatus.ACTIVE,
          activeRequest: null
        }
      ]);
      service.hasMaterialChange = jest.fn().mockResolvedValue(opts.hasMaterialChange);
      jest.useFakeTimers().setSystemTime(opts.ahora);
      return service;
    };

    afterEach(() => jest.useRealTimers());

    it('sin cambio material no hay reembolso, aunque falte para el evento', async () => {
      const service = armar({
        orderStatus: OrderStatus.PAID,
        hasMaterialChange: false,
        ahora: new Date('2026-09-01T00:00:00.000Z')
      });
      const r = (await service.getEligibility('o1', 'u1')) as { canRequest: boolean; reason: string };
      expect(r.canRequest).toBe(false);
      expect(r.reason).toContain('no tuvo cambios');
    });

    it('con cambio material y antes del evento, se puede pedir', async () => {
      const service = armar({
        orderStatus: OrderStatus.PAID,
        hasMaterialChange: true,
        ahora: new Date('2026-09-30T00:00:00.000Z')
      });
      const r = (await service.getEligibility('o1', 'u1')) as {
        canRequest: boolean;
        windowEndsAt: Date;
        tickets: { amount: number }[];
      };
      expect(r.canRequest).toBe(true);
      expect(r.windowEndsAt.toISOString()).toBe(evento.startDate);
      // El monto es el valor de la entrada, sin el 15% de fee.
      expect(r.tickets[0].amount).toBe(1500);
    });

    it('empezado el evento, se cierra', async () => {
      const service = armar({
        orderStatus: OrderStatus.PAID,
        hasMaterialChange: true,
        ahora: new Date('2026-10-02T00:00:00.000Z')
      });
      const r = (await service.getEligibility('o1', 'u1')) as { canRequest: boolean; reason: string };
      expect(r.canRequest).toBe(false);
      expect(r.reason).toContain('venció');
    });

    it('la extensión del Admin reabre el plazo después del evento', async () => {
      const service = armar({
        orderStatus: OrderStatus.PAID,
        hasMaterialChange: true,
        extendedTo: '2026-10-20T00:00:00.000Z',
        ahora: new Date('2026-10-02T00:00:00.000Z')
      });
      const r = (await service.getEligibility('o1', 'u1')) as { canRequest: boolean };
      expect(r.canRequest).toBe(true);
    });

    it('una orden sin pagar no genera reembolso', async () => {
      const service = armar({
        orderStatus: OrderStatus.PENDING_PAYMENT,
        hasMaterialChange: true,
        ahora: new Date('2026-09-30T00:00:00.000Z')
      });
      const r = (await service.getEligibility('o1', 'u1')) as { canRequest: boolean; reason: string };
      expect(r.canRequest).toBe(false);
      expect(r.reason).toContain('no está pagada');
    });
  });

  describe('executeRefund traduce lo que responde Mercado Pago', () => {
    const request = { uuid: 'r1', mpPaymentId: '123', amount: 1500 };

    const conRespuesta = (impl: () => unknown) => {
      const service = build();
      service.mpRefundClient = () => ({ create: impl });
      return service;
    };

    it('approved deja la plata devuelta', async () => {
      const service = conRespuesta(async () => ({
        id: 987,
        status: 'approved',
        unique_sequence_number: 'SEQ-1',
        amount_refunded_to_payer: 1500
      }));
      const r = (await service.executeRefund(request)) as {
        status: string;
        extra: Record<string, unknown>;
      };
      expect(r.status).toBe('refunded');
      expect(r.extra.mpRefundId).toBe('987');
      expect(r.extra.uniqueSequenceNumber).toBe('SEQ-1');
      expect(r.extra.amountRefundedToPayer).toBe(1500);
    });

    it('in_process queda en curso, no se da por pagado', async () => {
      const service = conRespuesta(async () => ({ id: 988, status: 'in_process' }));
      const r = (await service.executeRefund(request)) as { status: string };
      expect(r.status).toBe('processing');
    });

    it('cualquier otro estado es un fallo con motivo', async () => {
      const service = conRespuesta(async () => ({ id: 989, status: 'rejected' }));
      const r = (await service.executeRefund(request)) as {
        status: string;
        extra: { resolutionReason: string };
      };
      expect(r.status).toBe('failed');
      expect(r.extra.resolutionReason).toContain('rejected');
    });

    it('si la llamada explota, falla con el mensaje y no rompe la corrida', async () => {
      const service = conRespuesta(async () => {
        throw new Error('timeout contra MP');
      });
      const r = (await service.executeRefund(request)) as {
        status: string;
        extra: { resolutionReason: string };
      };
      expect(r.status).toBe('failed');
      expect(r.extra.resolutionReason).toContain('timeout');
    });

    it('manda el uuid de la solicitud como idempotency key', async () => {
      const create = jest.fn().mockResolvedValue({ id: 1, status: 'approved' });
      const service = build();
      service.mpRefundClient = () => ({ create });
      await service.executeRefund(request);

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ requestOptions: { idempotencyKey: 'r1' } })
      );
    });
  });

  describe('la ventana usada por el servicio es la misma del evento', () => {
    it('resolveRefundWindowEndsAt no depende de cuándo se avisó', () => {
      const start = '2026-10-01T23:00:00.000Z';
      expect(resolveRefundWindowEndsAt(start).toISOString()).toBe(start);
      expect(resolveRefundWindowEndsAt(start, '2026-11-01T00:00:00.000Z').toISOString()).toBe(
        '2026-11-01T00:00:00.000Z'
      );
    });
  });
});
