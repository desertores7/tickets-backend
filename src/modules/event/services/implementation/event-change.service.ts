import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common';
import { In, IsNull, LessThanOrEqual, Not } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DBRepository } from '@config/db/db.repository';
import {
  EventChangeEntity,
  EventChangeFieldSnapshot,
  EventChangeType
} from '@config/db/entities/tickets/event_change.entity';
import { EventEntity } from '@config/db/entities/tickets/event.entity';
import { OrderStatus } from '@config/db/entities/tickets/order.entity';
import { EnvService } from '@config/env/env.service';
import { NotificationEmailService } from '@modules/notifications/services/implementation/notification-email.service';
import { UserPermissionService } from '@root/shared/services/userPermissions.service';
import { EMAIL_TEMPLATES } from '@root/shared/email/resolve-templates-path';
import {
  resolveRefundWindowEndsAt,
  detectEventUpdateChanges,
  EventSnapshotForChange,
  EventUpdateForChange,
  normalizeLineup,
  resolveOpenRefundWindowEndsAt
} from '../core/event-change.helpers';

export type TEventChangeItem = {
  uuid: string;
  type: EventChangeType;
  isMaterial: boolean;
  reason: string | null;
  changes: EventChangeFieldSnapshot[];
  ticketTypeUuid: string | null;
  refundWindowEndsAt: string | null;
  notifiedAt: string | null;
  buyersNotified: number;
  createdByName: string | null;
  createdAt: string;
};

export type TEventChangesResult = {
  items: TEventChangeItem[];
  openRefundWindowEndsAt: string | null;
};

@Injectable()
export class EventChangeService {
  private readonly logger = new Logger(EventChangeService.name);

  constructor(
    @Inject(DBRepository) private readonly dbRepository: DBRepository,
    private readonly userPermission: UserPermissionService,
    private readonly notificationEmail: NotificationEmailService,
    private readonly envService: EnvService
  ) {}

  async listChanges(eventUuid: string, loggedUser: string): Promise<TEventChangesResult> {
    await this.assertProducerAccess(eventUuid, loggedUser);

    const rows = (await this.dbRepository.findMany({
      entity: 'event_change',
      where: { eventUuid },
      other: { order: { createdAt: 'DESC' } }
    })) as EventChangeEntity[];

    const nameByUser = await this.resolveUserNames(rows.map(r => r.createdByUuid));
    const items = rows.map(row => this.toItem(row, nameByUser.get(row.createdByUuid ?? '') ?? null));
    const open = resolveOpenRefundWindowEndsAt(rows.map(r => r.refundWindowEndsAt));

    return {
      items,
      openRefundWindowEndsAt: open ? open.toISOString() : null
    };
  }

  /**
   * Cancela el evento (BR-EVENT-010). No borra ni despublica.
   * Con ventas: material + email + ventana hasta el inicio del evento. Siempre
   * corta la venta.
   */
  async cancelEvent(
    eventUuid: string,
    loggedUser: string,
    reason?: string | null
  ): Promise<TEventChangeItem> {
    const event = await this.assertProducerAccess(eventUuid, loggedUser);

    if (event.cancelledAt) {
      throw new ConflictException('El evento ya está cancelado');
    }

    const now = new Date();
    const trimmedReason = reason?.trim() || null;

    await this.dbRepository.update({
      entity: 'event',
      where: { uuid: event.uuid },
      data: {
        cancelledAt: now,
        cancellationReason: trimmedReason,
        salesClosedAt: event.salesClosedAt ?? now
      }
    });

    const changes: EventChangeFieldSnapshot[] = [
      {
        field: 'status',
        label: 'Estado',
        before: 'Activo',
        after: 'Cancelado'
      }
    ];

    return this.persistChangeAndMaybeNotify({
      event,
      type: 'cancellation',
      isMaterial: true,
      reason: trimmedReason,
      changes,
      createdByUuid: loggedUser,
      newStartDate: null,
      forceNotifyWithSales: true
    });
  }

  /**
   * Cierre manual de venta — solo Admin / interno (BR-EVENT-013).
   */
  async closeSalesAdmin(eventUuid: string, loggedUser: string): Promise<TEventChangeItem> {
    const isAdmin = await this.userPermission.userPermission(loggedUser);
    if (!isAdmin) {
      throw new ForbiddenException('Solo un administrador puede cerrar la venta manualmente');
    }

    const event = await this.findActiveEvent(eventUuid);
    if (event.salesClosedAt) {
      throw new ConflictException('La venta del evento ya está cerrada');
    }

    const now = new Date();
    await this.dbRepository.update({
      entity: 'event',
      where: { uuid: event.uuid },
      data: { salesClosedAt: now }
    });

    return this.persistChangeAndMaybeNotify({
      event,
      type: 'sales_close',
      isMaterial: false,
      reason: null,
      changes: [
        {
          field: 'salesClosedAt',
          label: 'Venta',
          before: 'Abierta',
          after: 'Cerrada'
        }
      ],
      createdByUuid: loggedUser,
      newStartDate: null,
      forceNotifyWithSales: false
    });
  }

  /**
   * Corta o reabre la venta a mano (`BR-EVENT-013`). Productor dueño o Admin.
   * No es material: quien ya compró no pierde nada porque dejen de venderse entradas.
   * Un evento cancelado no se puede reabrir.
   */
  async setSalesClosed(
    eventUuid: string,
    closed: boolean,
    loggedUser: string
  ): Promise<Date | null> {
    await this.assertProducerAccess(eventUuid, loggedUser);
    const event = await this.findActiveEvent(eventUuid);

    if (event.cancelledAt && !closed) {
      throw new BadRequestException('No se puede reabrir la venta de un evento cancelado');
    }

    const alreadyClosed = Boolean(event.salesClosedAt);
    if (closed === alreadyClosed) {
      return event.salesClosedAt;
    }

    const salesClosedAt = closed ? new Date() : null;
    await this.dbRepository.update({
      entity: 'event',
      where: { uuid: event.uuid },
      data: { salesClosedAt }
    });

    await this.persistChangeAndMaybeNotify({
      event,
      type: 'sales_close',
      isMaterial: false,
      reason: null,
      changes: [
        {
          field: 'salesClosedAt',
          label: 'Venta',
          before: alreadyClosed ? 'Cerrada' : 'Abierta',
          after: closed ? 'Cerrada' : 'Abierta'
        }
      ],
      createdByUuid: loggedUser,
      newStartDate: null,
      forceNotifyWithSales: false
    });

    return salesClosedAt;
  }

  /**
   * Job BR-EVENT-013: setea salesClosedAt en eventos cuyo endDate ya pasó.
   */
  async closeSalesForEndedEvents(batchSize = 200): Promise<number> {
    const now = new Date();
    const ended = (await this.dbRepository.findMany({
      entity: 'event',
      where: {
        isActive: true,
        salesClosedAt: IsNull(),
        cancelledAt: IsNull(),
        endDate: LessThanOrEqual(now)
      },
      other: { take: batchSize, order: { endDate: 'ASC' } }
    })) as EventEntity[];

    let closed = 0;
    for (const event of ended) {
      const closedAt = new Date(event.endDate);
      await this.dbRepository.update({
        entity: 'event',
        where: { uuid: event.uuid },
        data: { salesClosedAt: closedAt }
      });

      await this.persistChangeAndMaybeNotify({
        event,
        type: 'sales_close',
        isMaterial: false,
        reason: null,
        changes: [
          {
            field: 'salesClosedAt',
            label: 'Venta',
            before: 'Abierta',
            after: 'Cerrada (fin del evento)'
          }
        ],
        createdByUuid: null,
        newStartDate: null,
        forceNotifyWithSales: false
      });
      closed++;
    }

    if (closed > 0) {
      this.logger.log(`Closed sales for ${closed} ended event(s)`);
    }
    return closed;
  }

  /** Tras un update de evento: persiste grupos detectados y notifica si hay ventas. */
  async recordUpdateChanges(
    eventBefore: EventSnapshotForChange & { uuid: string; organizationUuid: string },
    patch: EventUpdateForChange,
    loggedUser: string
  ): Promise<void> {
    const groups = detectEventUpdateChanges(eventBefore, patch);
    if (!groups.length) return;

    const event = eventBefore as EventEntity & EventSnapshotForChange;
    const newStart =
      patch.startDate !== undefined ? new Date(patch.startDate) : new Date(eventBefore.startDate);

    for (const group of groups) {
      await this.persistChangeAndMaybeNotify({
        event,
        type: group.type,
        isMaterial: group.isMaterial,
        reason: null,
        changes: group.changes,
        createdByUuid: loggedUser,
        newStartDate: group.type === 'reschedule' ? newStart : null,
        forceNotifyWithSales: group.isMaterial
      });
    }
  }

  /** Auditoría de ajuste de stock (no material). */
  async recordStockChange(params: {
    eventUuid: string;
    ticketTypeUuid: string;
    ticketTypeName: string;
    beforeQuantity: number;
    afterQuantity: number;
    loggedUser: string;
  }): Promise<void> {
    if (params.beforeQuantity === params.afterQuantity) return;

    const event = await this.findActiveEvent(params.eventUuid);
    await this.persistChangeAndMaybeNotify({
      event,
      type: 'stock',
      isMaterial: false,
      reason: null,
      changes: [
        {
          field: 'quantity',
          label: `Stock · ${params.ticketTypeName}`,
          before: String(params.beforeQuantity),
          after: String(params.afterQuantity)
        }
      ],
      createdByUuid: params.loggedUser,
      ticketTypeUuid: params.ticketTypeUuid,
      newStartDate: null,
      forceNotifyWithSales: false
    });
  }

  /**
   * Extiende la ventana de reembolso de un evento (`BR-REFUND-010`).
   *
   * **Solo Administrador**, y solo hacia adelante. Existe para el caso
   * excepcional: una reprogramación o cancelación tan sobre la hora que el
   * inicio del evento no deja plazo útil para pedir el reembolso.
   *
   * Lo decide el Admin porque es quien retiene el dinero de las entradas: no
   * puede liquidarle a la productora hasta que la ventana cierre
   * (`BR-PAY-005`). Quien asume el riesgo define el plazo.
   */
  async extendRefundWindow(
    eventUuid: string,
    extendedTo: Date,
    reason: string,
    loggedUser: string
  ): Promise<TEventChangeItem> {
    const isAdmin = await this.userPermission.userPermission(loggedUser);
    if (!isAdmin) {
      throw new ForbiddenException(
        'Solo un administrador puede extender el plazo de reembolso'
      );
    }

    const event = await this.findActiveEvent(eventUuid);

    const motivo = reason?.trim();
    if (!motivo) {
      throw new BadRequestException('Indicá el motivo de la extensión');
    }

    const actual = resolveRefundWindowEndsAt(event.startDate, event.refundWindowExtendedTo);

    // Nunca hacia atrás: acortar el plazo sería quitarle al comprador un
    // derecho que ya se le comunicó por email.
    if (extendedTo <= actual) {
      throw new BadRequestException(
        `El plazo solo se puede extender. Hoy vence ${actual.toISOString()}`
      );
    }

    await this.dbRepository.update({
      entity: 'event',
      where: { uuid: event.uuid },
      data: { refundWindowExtendedTo: extendedTo, refundWindowReason: motivo }
    });

    // Queda en el historial del evento: es una decisión sobre plata de terceros
    // y hay que poder explicarla después.
    return this.persistChangeAndMaybeNotify({
      event: { ...event, refundWindowExtendedTo: extendedTo },
      type: 'refund_window',
      isMaterial: false,
      reason: motivo,
      changes: [
        {
          field: 'refundWindowEndsAt',
          label: 'Plazo para pedir reembolso',
          before: actual.toISOString(),
          after: extendedTo.toISOString()
        }
      ],
      createdByUuid: loggedUser,
      newStartDate: null,
      // El aviso lo maneja el Admin fuera del sistema: esta extensión nace de
      // una conversación con la productora, no de un cambio del evento.
      forceNotifyWithSales: false
    });
  }

  /**
   * Ventana vigente de un evento, o null si no hay reembolsos habilitados.
   *
   * Solo hay ventana si hubo al menos un cambio material comunicado: sin eso no
   * hay derecho a reembolso (`BR-REFUND-001`).
   */
  async getRefundWindow(eventUuid: string): Promise<{
    endsAt: Date | null;
    isOpen: boolean;
    extendedTo: Date | null;
    reason: string | null;
  }> {
    const event = await this.findActiveEvent(eventUuid);

    const notified = await this.dbRepository.count({
      entity: 'event_change',
      where: { eventUuid, isMaterial: true, notifiedAt: Not(IsNull()) } as never
    });

    if (!notified) {
      return { endsAt: null, isOpen: false, extendedTo: null, reason: null };
    }

    const endsAt = resolveRefundWindowEndsAt(event.startDate, event.refundWindowExtendedTo);
    return {
      endsAt,
      isOpen: endsAt > new Date(),
      extendedTo: event.refundWindowExtendedTo,
      reason: event.refundWindowReason
    };
  }

  private async persistChangeAndMaybeNotify(params: {
    event: Pick<
      EventEntity,
      'uuid' | 'name' | 'startDate' | 'organizationUuid' | 'refundWindowExtendedTo'
    >;
    type: EventChangeType;
    isMaterial: boolean;
    reason: string | null;
    changes: EventChangeFieldSnapshot[];
    createdByUuid: string | null;
    ticketTypeUuid?: string | null;
    newStartDate: Date | null;
    forceNotifyWithSales: boolean;
  }): Promise<TEventChangeItem> {
    const hasSales = await this.eventHasPaidSales(params.event.uuid);
    const shouldNotify = params.forceNotifyWithSales && params.isMaterial && hasSales;

    const now = new Date();
    let refundWindowEndsAt: Date | null = null;
    let notifiedAt: Date | null = null;
    let buyersNotified = 0;

    if (shouldNotify) {
      notifiedAt = now;
      // `BR-REFUND-010`: el límite es el inicio del evento — el nuevo, si esta
      // misma edición lo reprogramó — o la extensión que haya puesto un Admin.
      // Se guarda en la fila como registro de lo que se le comunicó al
      // comprador; la elegibilidad se evalúa siempre contra el evento, para que
      // una extensión posterior alcance también a los cambios ya avisados.
      const windowEnd = resolveRefundWindowEndsAt(
        params.newStartDate ?? params.event.startDate,
        params.event.refundWindowExtendedTo
      );
      refundWindowEndsAt = windowEnd;
      buyersNotified = await this.notifyBuyers({
        event: params.event,
        type: params.type,
        changes: params.changes,
        reason: params.reason,
        refundWindowEndsAt: windowEnd
      });
    }

    const row = new EventChangeEntity();
    row.uuid = uuidv4();
    row.eventUuid = params.event.uuid;
    row.type = params.type;
    row.isMaterial = params.isMaterial;
    row.reason = params.reason;
    row.changes = params.changes;
    row.ticketTypeUuid = params.ticketTypeUuid ?? null;
    row.refundWindowEndsAt = refundWindowEndsAt;
    row.notifiedAt = notifiedAt;
    row.buyersNotified = buyersNotified;
    row.createdByUuid = params.createdByUuid;

    await this.dbRepository.create({ entity: 'event_change', data: row });

    const saved = (await this.dbRepository.findOne({
      entity: 'event_change',
      where: { uuid: row.uuid }
    })) as EventChangeEntity;

    const nameByUser = await this.resolveUserNames([saved.createdByUuid]);
    return this.toItem(saved, nameByUser.get(saved.createdByUuid ?? '') ?? null);
  }

  private async notifyBuyers(params: {
    event: Pick<EventEntity, 'uuid' | 'name'>;
    type: EventChangeType;
    changes: EventChangeFieldSnapshot[];
    reason: string | null;
    refundWindowEndsAt: Date;
  }): Promise<number> {
    const buyers = await this.findPaidBuyers(params.event.uuid);
    if (!buyers.length) return 0;

    const appUrl = this.envService.get('APP_URL') ?? '';
    const changeSummary = params.changes
      .map(c => `${c.label}: ${c.before ?? '—'} → ${c.after ?? '—'}`)
      .join('\n');

    const typeLabel: Record<EventChangeType, string> = {
      reschedule: 'Reprogramación',
      venue: 'Cambio de lugar',
      lineup: 'Cambio de lineup',
      cancellation: 'Cancelación',
      sales_close: 'Cierre de venta',
      stock: 'Ajuste de stock',
      info: 'Actualización',
      refund_window: 'Plazo de reembolso'
    };

    let sent = 0;
    for (const buyer of buyers) {
      try {
        await this.notificationEmail.sendTemplateEmail({
          templateName: EMAIL_TEMPLATES.eventMaterialChange,
          to: buyer.email,
          subject: `${typeLabel[params.type]}: ${params.event.name}`,
          templateData: {
            firstName: buyer.firstName,
            eventName: params.event.name,
            changeType: typeLabel[params.type],
            changeSummary,
            reason: params.reason,
            refundWindowEndsAt: params.refundWindowEndsAt.toISOString(),
            ticketsUrl: appUrl ? `${appUrl.replace(/\/$/, '')}/client/tickets` : null,
            preheader: `Hubo un cambio en ${params.event.name}`
          }
        });
        sent++;
      } catch (err) {
        this.logger.error(
          `Failed to notify buyer ${buyer.email} for event ${params.event.uuid}`,
          err instanceof Error ? err.stack : String(err)
        );
      }
    }
    return sent;
  }

  private async findPaidBuyers(
    eventUuid: string
  ): Promise<Array<{ email: string; firstName: string }>> {
    const orders = (await this.dbRepository.findMany({
      entity: 'orders',
      where: { eventUuid, status: OrderStatus.PAID }
    })) as Array<{ userUuid: string }>;

    const userUuids = [...new Set(orders.map(o => o.userUuid).filter(Boolean))];
    if (!userUuids.length) return [];

    const users = (await this.dbRepository.findMany({
      entity: 'user',
      where: { uuid: In(userUuids) } as any
    })) as Array<{ uuid: string; email: string; firstName: string }>;

    const byEmail = new Map<string, { email: string; firstName: string }>();
    for (const user of users) {
      const email = user.email?.trim();
      if (!email) continue;
      if (!byEmail.has(email)) {
        byEmail.set(email, {
          email,
          firstName: user.firstName?.trim() || 'hola'
        });
      }
    }
    return [...byEmail.values()];
  }

  private async resolveUserNames(
    userUuids: Array<string | null | undefined>
  ): Promise<Map<string, string>> {
    const uuids = [...new Set(userUuids.filter((u): u is string => Boolean(u)))];
    const map = new Map<string, string>();
    if (!uuids.length) return map;

    const users = (await this.dbRepository.findMany({
      entity: 'user',
      where: { uuid: In(uuids) } as any
    })) as Array<{ uuid: string; firstName: string; lastName: string }>;

    for (const user of users) {
      const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
      if (name) map.set(user.uuid, name);
    }
    return map;
  }

  private async eventHasPaidSales(eventUuid: string): Promise<boolean> {
    const count = await this.dbRepository.count({
      entity: 'orders',
      where: { eventUuid, status: OrderStatus.PAID }
    });
    return count > 0;
  }

  private async findActiveEvent(eventUuid: string): Promise<EventEntity> {
    const event = await this.dbRepository.findOne({
      entity: 'event',
      where: { uuid: eventUuid, isActive: true }
    });
    if (!event) throw new NotFoundException('Evento no encontrado');
    return event as EventEntity;
  }

  /** Productor dueño / miembro / asignado, o Admin. 404 si no es suyo. */
  private async assertProducerAccess(eventUuid: string, loggedUser: string): Promise<EventEntity> {
    const event = await this.findActiveEvent(eventUuid);

    const isAdmin = await this.userPermission.userPermission(loggedUser);
    if (isAdmin) return event;

    const membership = await this.dbRepository.findOne({
      entity: 'user_organization',
      where: {
        userUuid: loggedUser,
        organizationUuid: event.organizationUuid,
        isDeleted: IsNull()
      } as any
    });
    if (membership) return event;

    const assignment = await this.dbRepository.findOne({
      entity: 'event_producer',
      where: { userUuid: loggedUser, eventUuid: event.uuid } as any
    });
    if (!assignment) {
      throw new NotFoundException('Evento no encontrado');
    }
    return event;
  }

  private toItem(row: EventChangeEntity, createdByName: string | null): TEventChangeItem {
    return {
      uuid: row.uuid,
      type: row.type,
      isMaterial: row.isMaterial,
      reason: row.reason,
      changes: row.changes ?? [],
      ticketTypeUuid: row.ticketTypeUuid,
      refundWindowEndsAt: row.refundWindowEndsAt
        ? new Date(row.refundWindowEndsAt).toISOString()
        : null,
      notifiedAt: row.notifiedAt ? new Date(row.notifiedAt).toISOString() : null,
      buyersNotified: row.buyersNotified ?? 0,
      createdByName,
      createdAt: new Date(row.createdAt).toISOString()
    };
  }
}

export function toEventSnapshot(event: EventEntity): EventSnapshotForChange & {
  uuid: string;
  organizationUuid: string;
} {
  return {
    uuid: event.uuid,
    organizationUuid: event.organizationUuid,
    startDate: event.startDate,
    endDate: event.endDate,
    venueName: event.venueName,
    venueAddress: event.venueAddress,
    venueCity: event.venueCity,
    venueCountry: event.venueCountry,
    venuePostalCode: event.venuePostalCode ?? '',
    googleMapsUrl: event.googleMapsUrl,
    description: event.description,
    lineup: normalizeLineup(event.lineup)
  };
}
