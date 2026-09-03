import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { In, IsNull } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DBRepository } from '@config/db/db.repository';
import { StockAlertEntity } from '@config/db/entities/tickets/stock_alert.entity';
import { TicketTypeEntity } from '@config/db/entities/tickets/ticket_type.entity';
import { IUserNotificationService } from '@modules/notifications/services/contracts/iuser-notification.service';
import { EmailService } from '@root/shared/auth/services/email.service';
import {
  IStockAlert,
  IStockAlertService,
  IUpsertStockAlertPayload
} from '../contracts/istock-alert.service';

@Injectable()
export class StockAlertService implements IStockAlertService {
  private readonly logger = new Logger(StockAlertService.name);

  /** Umbral "queda poco": 20% del stock total, más aviso al agotarse. */
  static readonly DEFAULT_LOW_THRESHOLD_PERCENT = 20;

  constructor(
    private readonly dbRepository: DBRepository,
    private readonly emailService: EmailService,
    @Inject('IUserNotificationService')
    private readonly userNotificationService: IUserNotificationService
  ) {}

  // ── Configuración ───────────────────────────────────────────────────────────

  private async assertOwnsEvent(eventUuid: string, loggedUser: string): Promise<void> {
    const event = await this.dbRepository.findOne({ entity: 'event', where: { uuid: eventUuid } });
    if (!event) throw new NotFoundException('Evento no encontrado');

    const membership = await this.dbRepository.findOne({
      entity: 'user_organization',
      where: {
        userUuid: loggedUser,
        organizationUuid: event.organizationUuid,
        isDeleted: IsNull()
      } as never
    });
    if (!membership) throw new NotFoundException('No tenés acceso a este evento');
  }

  private toAlert(
    alert: StockAlertEntity,
    ticketType: { name: string; availableQuantity: number; quantity: number }
  ): IStockAlert {
    return {
      uuid: alert.uuid,
      ticketTypeUuid: alert.ticketTypeUuid,
      ticketTypeName: ticketType.name,
      lowThreshold: alert.lowThreshold,
      thresholdIsPercent: Boolean(alert.thresholdIsPercent),
      notifySoldOut: Boolean(alert.notifySoldOut),
      active: Boolean(alert.active),
      lowNotifiedAt: alert.lowNotifiedAt,
      soldOutNotifiedAt: alert.soldOutNotifiedAt,
      availableQuantity: ticketType.availableQuantity,
      totalQuantity: ticketType.quantity
    };
  }

  async listByEvent(eventUuid: string, loggedUser: string): Promise<IStockAlert[]> {
    await this.assertOwnsEvent(eventUuid, loggedUser);

    const alerts = (await this.dbRepository.findMany({
      entity: 'stock_alert',
      where: { eventUuid, isDeleted: IsNull() },
      relations: { ticketType: true }
    })) as (StockAlertEntity & { ticketType?: TicketTypeEntity })[];

    return alerts
      .filter(a => a.ticketType)
      .map(a => this.toAlert(a, a.ticketType as TicketTypeEntity));
  }

  async upsert(
    eventUuid: string,
    payload: IUpsertStockAlertPayload,
    loggedUser: string
  ): Promise<IStockAlert> {
    await this.assertOwnsEvent(eventUuid, loggedUser);

    const ticketType = (await this.dbRepository.findOne({
      entity: 'ticket_type',
      where: { uuid: payload.ticketTypeUuid, eventUuid }
    })) as TicketTypeEntity | null;

    if (!ticketType) throw new NotFoundException('La tanda no pertenece a este evento');

    if (payload.lowThreshold !== undefined && payload.lowThreshold !== null) {
      if (payload.lowThreshold <= 0) {
        throw new BadRequestException('El umbral debe ser mayor a 0');
      }
      if (payload.thresholdIsPercent && payload.lowThreshold > 100) {
        throw new BadRequestException('Un porcentaje no puede superar 100');
      }
    }

    const existing = (await this.dbRepository.findOne({
      entity: 'stock_alert',
      where: { ticketTypeUuid: payload.ticketTypeUuid }
    })) as StockAlertEntity | null;

    if (existing) {
      const patch: Partial<StockAlertEntity> = { isDeleted: null };
      if (payload.lowThreshold !== undefined) patch.lowThreshold = payload.lowThreshold;
      if (payload.thresholdIsPercent !== undefined) patch.thresholdIsPercent = payload.thresholdIsPercent;
      if (payload.notifySoldOut !== undefined) patch.notifySoldOut = payload.notifySoldOut;
      if (payload.active !== undefined) patch.active = payload.active;

      // Cambiar la configuración rearma el aviso: si el productor sube el
      // umbral, quiere que le vuelvan a avisar con el criterio nuevo.
      patch.lowNotifiedAt = null;
      patch.soldOutNotifiedAt = null;

      await this.dbRepository.update({
        entity: 'stock_alert',
        where: { uuid: existing.uuid },
        data: patch as never
      });

      return this.toAlert({ ...existing, ...patch } as StockAlertEntity, ticketType);
    }

    const alert = new StockAlertEntity();
    alert.uuid = uuidv4();
    alert.eventUuid = eventUuid;
    alert.ticketTypeUuid = payload.ticketTypeUuid;
    alert.lowThreshold = payload.lowThreshold ?? null;
    alert.thresholdIsPercent = payload.thresholdIsPercent ?? false;
    alert.notifySoldOut = payload.notifySoldOut ?? true;
    alert.active = payload.active ?? true;
    alert.lowNotifiedAt = null;
    alert.soldOutNotifiedAt = null;
    alert.isDeleted = null;

    await this.dbRepository.create({ entity: 'stock_alert', data: alert });
    return this.toAlert(alert, ticketType);
  }

  async remove(eventUuid: string, alertUuid: string, loggedUser: string): Promise<void> {
    await this.assertOwnsEvent(eventUuid, loggedUser);

    const alert = await this.dbRepository.findOne({
      entity: 'stock_alert',
      where: { uuid: alertUuid, eventUuid, isDeleted: IsNull() }
    });
    if (!alert) throw new NotFoundException('La alerta no existe');

    await this.dbRepository.update({
      entity: 'stock_alert',
      where: { uuid: alertUuid },
      data: { isDeleted: true } as never
    });
  }

  async ensureDefaultForTicketType(eventUuid: string, ticketTypeUuid: string): Promise<void> {
    const existing = await this.dbRepository.findOne({
      entity: 'stock_alert',
      where: { ticketTypeUuid }
    });
    if (existing) return;

    const alert = new StockAlertEntity();
    alert.uuid = uuidv4();
    alert.eventUuid = eventUuid;
    alert.ticketTypeUuid = ticketTypeUuid;
    alert.lowThreshold = StockAlertService.DEFAULT_LOW_THRESHOLD_PERCENT;
    alert.thresholdIsPercent = true;
    alert.notifySoldOut = true;
    alert.active = true;
    alert.lowNotifiedAt = null;
    alert.soldOutNotifiedAt = null;
    alert.isDeleted = null;

    await this.dbRepository.create({ entity: 'stock_alert', data: alert });
  }

  // ── Evaluación tras la venta (BR-EVENT-017) ─────────────────────────────────

  /**
   * Corre después de confirmar el stock de una compra.
   *
   * Nunca lanza: una alerta que falla no puede tumbar una venta ya cobrada. El
   * llamador la invoca sin esperarla.
   */
  async evaluateAfterSale(ticketTypeUuids: string[]): Promise<void> {
    if (!ticketTypeUuids.length) return;

    try {
      const alerts = (await this.dbRepository.findMany({
        entity: 'stock_alert',
        where: { ticketTypeUuid: In(ticketTypeUuids), active: true, isDeleted: IsNull() } as never,
        relations: { ticketType: true, event: true }
      })) as (StockAlertEntity & {
        ticketType?: TicketTypeEntity;
        event?: { uuid: string; name: string; organizationUuid: string };
      })[];

      for (const alert of alerts) {
        if (!alert.ticketType || !alert.event) continue;
        await this.evaluateOne(alert, alert.ticketType, alert.event);
      }
    } catch (err) {
      this.logger.warn(`No se pudieron evaluar las alertas de stock: ${err}`);
    }
  }

  private async evaluateOne(
    alert: StockAlertEntity,
    ticketType: TicketTypeEntity,
    event: { uuid: string; name: string; organizationUuid: string }
  ): Promise<void> {
    const available = Number(ticketType.availableQuantity);
    const total = Number(ticketType.quantity);

    // Agotado primero: si llegó a cero, el aviso relevante es ese y no el de
    // "queda poco", aunque técnicamente también cruzó ese umbral.
    if (available <= 0) {
      if (!alert.notifySoldOut || alert.soldOutNotifiedAt) return;

      await this.notify(
        event,
        `Se agotó ${ticketType.name}`,
        `Vendiste las ${total} entradas de ${ticketType.name} en ${event.name}. ` +
          'Si querés seguir vendiendo, podés crear una tanda nueva desde el evento.'
      );
      await this.markNotified(alert.uuid, { soldOutNotifiedAt: new Date() });
      return;
    }

    const threshold = this.resolveThreshold(alert, total);
    if (threshold === null || available > threshold || alert.lowNotifiedAt) return;

    await this.notify(
      event,
      `Queda poco de ${ticketType.name}`,
      `Quedan ${available} de ${total} entradas de ${ticketType.name} en ${event.name}. ` +
        'Va muy bien: si se agota, podés abrir una tanda nueva.'
    );
    await this.markNotified(alert.uuid, { lowNotifiedAt: new Date() });
  }

  /** Traduce el umbral a unidades: puede estar configurado como porcentaje. */
  private resolveThreshold(alert: StockAlertEntity, total: number): number | null {
    if (alert.lowThreshold === null) return null;
    if (!alert.thresholdIsPercent) return alert.lowThreshold;
    return Math.ceil((total * alert.lowThreshold) / 100);
  }

  private async markNotified(alertUuid: string, patch: Partial<StockAlertEntity>): Promise<void> {
    await this.dbRepository.update({
      entity: 'stock_alert',
      where: { uuid: alertUuid },
      data: patch as never
    });
  }

  /**
   * Notifica a los miembros de la productora por los dos canales que pide
   * `BR-EVENT-017`: centro de notificaciones y email.
   */
  private async notify(
    event: { organizationUuid: string },
    title: string,
    body: string
  ): Promise<void> {
    const members = (await this.dbRepository.findMany({
      entity: 'user_organization',
      where: { organizationUuid: event.organizationUuid, isDeleted: IsNull() } as never,
      relations: { user: true }
    })) as { userUuid: string; user?: { email?: string; firstName?: string } }[];

    await Promise.allSettled(
      members.map(m => this.userNotificationService.create(m.userUuid, title, body))
    );

    // El email es el segundo canal, no el principal: si el SMTP falla, la
    // notificación in-app ya quedó registrada.
    await Promise.allSettled(
      members
        .filter(m => m.user?.email)
        .map(m =>
          this.emailService.send({
            to: m.user!.email as string,
            subject: title,
            text: body
          })
        )
    );
  }
}
