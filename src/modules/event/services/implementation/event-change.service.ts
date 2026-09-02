import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DBRepository } from '@config/db/db.repository';
import { EventEntity } from '@config/db/entities/tickets/event.entity';
import {
  EventChangeEntity,
  EventChangeField,
  EventChangeType
} from '@config/db/entities/tickets/event_change.entity';
import { EmailService } from '@root/shared/auth/services/email.service';
import { EnvService } from '@config/env/env.service';

/** `BR-REFUND-010`: 72 horas corridas desde el aviso. */
const REFUND_WINDOW_HOURS = 72;

/** Campos estructurados cuyo cambio es material (`BR-REFUND-010` punto 1). */
const MATERIAL_FIELDS: { field: keyof EventEntity; label: string; type: EventChangeType }[] = [
  { field: 'startDate', label: 'Inicio', type: 'reschedule' },
  { field: 'endDate', label: 'Fin', type: 'reschedule' },
  { field: 'venueName', label: 'Lugar', type: 'venue' },
  { field: 'venueAddress', label: 'Dirección', type: 'venue' },
  { field: 'venueCity', label: 'Ciudad', type: 'venue' },
  { field: 'venueCountry', label: 'País', type: 'venue' },
  { field: 'lineup', label: 'Lineup', type: 'lineup' }
];

type BuyerRow = { email: string; firstName: string | null };

/**
 * Detección de cambios materiales y operación post-publicación
 * (FP10 / `29` §19 / `BR-EVENT-010`).
 *
 * Dos reglas mandan sobre todo lo demás:
 *
 * - **No hay puerta del Admin.** Con la productora aprobada, el productor edita
 *   y publica el cambio directamente (`BR-EVENT-010`).
 * - **Material es automático**, sin toggle: lo definen los campos estructurados
 *   de `MATERIAL_FIELDS` más la cancelación (`BR-REFUND-010`). Reescribir la
 *   descripción no es material.
 *
 * La ventana de reembolso se calcula y se guarda desde ya, aunque el flujo de
 * solicitudes (`BR-REFUND-001`) todavía no exista: es el dato del que va a
 * depender, y reconstruirlo después sería imposible.
 */
@Injectable()
export class EventChangeService {
  private readonly logger = new Logger(EventChangeService.name);

  constructor(
    private readonly dbRepository: DBRepository,
    private readonly dataSource: DataSource,
    private readonly emailService: EmailService,
    private readonly envService: EnvService
  ) {}

  // ── Comparación ─────────────────────────────────────────────────────────────

  /** Texto estable para comparar y para mostrar en el historial. */
  private toText(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.join(' · ');
    return String(value);
  }

  /**
   * Campos materiales que cambiaron entre el evento anterior y el nuevo.
   *
   * Las fechas se comparan por su valor en milisegundos y no por identidad:
   * `updateEvent` recibe strings y la fila trae `Date`, así que compararlos
   * crudos marcaría un cambio en cada guardado.
   */
  private diffMaterial(before: EventEntity, after: Partial<EventEntity>): EventChangeField[] {
    const fields: EventChangeField[] = [];

    for (const { field, label } of MATERIAL_FIELDS) {
      if (!(field in after)) continue;

      const previous = this.toText(before[field]);
      const next = this.toText(after[field] as unknown);
      if (previous === next) continue;

      fields.push({ field: String(field), label, before: previous, after: next });
    }

    return fields;
  }

  private typeOf(fields: EventChangeField[]): EventChangeType {
    const first = MATERIAL_FIELDS.find(m => m.field === fields[0]?.field);
    // Un guardado puede tocar fecha y venue a la vez; se etiqueta por el primero
    // y el detalle completo queda en `changes`.
    return first?.type ?? 'info';
  }

  // ── Ventas ──────────────────────────────────────────────────────────────────

  /**
   * Compradores con entradas pagadas y sin usar (`BR-EVENT-007`).
   *
   * Se agrupa por email: una persona con tres órdenes recibe un aviso, no tres.
   */
  private async findBuyers(eventUuid: string): Promise<BuyerRow[]> {
    const rows = await this.dataSource
      .createQueryBuilder()
      .select('u.email', 'email')
      .addSelect('MIN(u.firstName)', 'firstName')
      .from('orders', 'o')
      .innerJoin('user', 'u', 'u.uuid = o.userUuid')
      .where('o.eventUuid = :eventUuid', { eventUuid })
      .andWhere("o.status = 'paid'")
      .groupBy('u.email')
      .getRawMany<BuyerRow>();

    return rows.filter(r => Boolean(r.email));
  }

  // ── Registro ────────────────────────────────────────────────────────────────

  /**
   * Fin de la ventana (`BR-REFUND-010` punto 3): 72 h desde el aviso, salvo que
   * el evento empiece antes — ahí cierra al inicio, lo que ocurra primero. Una
   * cancelación no tiene fecha nueva, así que se queda con las 72 h.
   */
  private windowEnd(notifiedAt: Date, newStart: Date | null): Date {
    const limit = new Date(notifiedAt.getTime() + REFUND_WINDOW_HOURS * 60 * 60 * 1000);
    if (!newStart) return limit;
    return newStart.getTime() > notifiedAt.getTime() && newStart < limit ? newStart : limit;
  }

  private async persist(data: Partial<EventChangeEntity>): Promise<EventChangeEntity> {
    const change = new EventChangeEntity();
    Object.assign(change, { uuid: uuidv4(), buyersNotified: 0, ...data });
    await this.dbRepository.create({ entity: 'event_change', data: change });
    return change;
  }

  // ── Aviso ───────────────────────────────────────────────────────────────────

  /**
   * Avisa a los compradores qué cambió.
   *
   * El email es **informativo y sin CTA de reembolso**: la ventana ya queda
   * abierta en la base, pero mientras no exista el flujo de solicitudes
   * (`BR-REFUND-001`) prometer un botón que no está sería peor que no avisar.
   * Cuando ese flujo exista, lo que cambia es el template, no esta lógica.
   */
  private async notifyBuyers(
    event: EventEntity,
    change: EventChangeEntity,
    buyers: BuyerRow[]
  ): Promise<number> {
    if (buyers.length === 0) return 0;

    const appUrl = (this.envService.get('APP_URL') ?? '').replace(/\/$/, '');
    const subject =
      change.type === 'cancellation'
        ? `Se canceló ${event.name}`
        : `Cambió información de ${event.name}`;

    const results = await Promise.allSettled(
      buyers.map(buyer =>
        this.emailService.sendTemplateEmail(
          'event-changed',
          {
            firstName: buyer.firstName ?? '',
            eventName: event.name,
            isCancellation: change.type === 'cancellation',
            reason: change.reason,
            changes: change.changes ?? [],
            ticketsUrl: appUrl ? `${appUrl}/client/tickets` : null
          },
          { to: buyer.email, subject }
        )
      )
    );

    const sent = results.filter(r => r.status === 'fulfilled').length;
    if (sent < buyers.length) {
      // El cambio ya está registrado: que falle el SMTP no puede deshacerlo ni
      // cortar el request del productor.
      this.logger.warn(
        `Aviso de cambio ${change.uuid}: ${buyers.length - sent} de ${buyers.length} emails fallaron`
      );
    }
    return sent;
  }

  // ── API interna ─────────────────────────────────────────────────────────────

  /**
   * Registra el cambio si tocó algún campo material. Devuelve `null` cuando el
   * guardado no cambió nada estructurado.
   *
   * Se llama **después** de persistir el evento: el registro documenta lo que
   * ya pasó, y fallar acá no puede dejar el evento a medio guardar.
   */
  async recordEventUpdate(
    before: EventEntity,
    after: Partial<EventEntity>,
    loggedUser: string
  ): Promise<EventChangeEntity | null> {
    const fields = this.diffMaterial(before, after);
    if (fields.length === 0) return null;

    // Sin publicar no hay a quién avisarle ni ventana que abrir: el registro
    // queda igual, como historial.
    const buyers = before.isPublished ? await this.findBuyers(before.uuid) : [];
    const hasSales = buyers.length > 0;
    const notifiedAt = hasSales ? new Date() : null;

    const newStartRaw = (after.startDate ?? before.startDate) as Date | string;
    const newStart = newStartRaw ? new Date(newStartRaw) : null;

    const change = await this.persist({
      eventUuid: before.uuid,
      type: this.typeOf(fields),
      isMaterial: true,
      changes: fields,
      refundWindowEndsAt: notifiedAt ? this.windowEnd(notifiedAt, newStart) : null,
      notifiedAt,
      createdBy: loggedUser
    });

    if (hasSales) {
      const sent = await this.notifyBuyers({ ...before, ...after } as EventEntity, change, buyers);
      change.buyersNotified = sent;
      await this.dbRepository.update({
        entity: 'event_change',
        where: { uuid: change.uuid },
        data: { buyersNotified: sent }
      });
    }

    return change;
  }

  /** Cambio de stock de una tanda. No es material, pero `BR-EVENT-005` lo audita. */
  async recordStockChange(
    eventUuid: string,
    ticketTypeUuid: string,
    ticketTypeName: string,
    before: number,
    after: number,
    loggedUser: string
  ): Promise<void> {
    if (before === after) return;

    await this.persist({
      eventUuid,
      type: 'stock',
      isMaterial: false,
      ticketTypeUuid,
      changes: [
        {
          field: 'quantity',
          label: `Stock — ${ticketTypeName}`,
          before: String(before),
          after: String(after)
        }
      ],
      createdBy: loggedUser
    });
  }

  // ── Acciones (`29` §19) ─────────────────────────────────────────────────────

  /**
   * Cancela el evento (`BR-EVENT-010`). Siempre material: con ventas abre
   * ventana y avisa; sin ventas queda solo el registro.
   *
   * No borra ni despublica: quien ya compró tiene que poder seguir viendo qué
   * pasó con su evento.
   */
  async cancelEvent(
    event: EventEntity,
    reason: string | null,
    loggedUser: string
  ): Promise<EventChangeEntity> {
    if (event.cancelledAt) throw new BadRequestException('El evento ya está cancelado');

    const cancelledAt = new Date();
    await this.dbRepository.update({
      entity: 'event',
      where: { uuid: event.uuid },
      data: {
        cancelledAt,
        cancellationReason: reason,
        // Cancelar corta la venta: seguir vendiendo entradas de un evento
        // cancelado sería vender algo que no va a pasar.
        salesClosedAt: event.salesClosedAt ?? cancelledAt
      }
    });

    const buyers = await this.findBuyers(event.uuid);
    const notifiedAt = buyers.length > 0 ? cancelledAt : null;

    const change = await this.persist({
      eventUuid: event.uuid,
      type: 'cancellation',
      isMaterial: true,
      changes: [
        { field: 'cancelledAt', label: 'Estado', before: 'Activo', after: 'Cancelado' }
      ],
      reason,
      // Cancelación sin fecha nueva: rigen las 72 h (`BR-REFUND-010` punto 3).
      refundWindowEndsAt: notifiedAt ? this.windowEnd(notifiedAt, null) : null,
      notifiedAt,
      createdBy: loggedUser
    });

    if (buyers.length > 0) {
      const sent = await this.notifyBuyers(event, change, buyers);
      change.buyersNotified = sent;
      await this.dbRepository.update({
        entity: 'event_change',
        where: { uuid: change.uuid },
        data: { buyersNotified: sent }
      });
    }

    return change;
  }

  /**
   * Corte manual de venta (`BR-EVENT-013`). No es material: nadie que ya compró
   * pierde nada porque dejen de venderse entradas.
   */
  async setSalesClosed(
    event: EventEntity,
    closed: boolean,
    loggedUser: string
  ): Promise<Date | null> {
    if (event.cancelledAt && !closed) {
      throw new BadRequestException('No se puede reabrir la venta de un evento cancelado');
    }

    const salesClosedAt = closed ? new Date() : null;
    await this.dbRepository.update({
      entity: 'event',
      where: { uuid: event.uuid },
      data: { salesClosedAt }
    });

    await this.persist({
      eventUuid: event.uuid,
      type: 'sales_close',
      isMaterial: false,
      changes: [
        {
          field: 'salesClosedAt',
          label: 'Venta',
          before: event.salesClosedAt ? 'Cortada' : 'Abierta',
          after: closed ? 'Cortada' : 'Abierta'
        }
      ],
      createdBy: loggedUser
    });

    return salesClosedAt;
  }

  /** Historial del evento, del más nuevo al más viejo (`29` §19). */
  async listChanges(eventUuid: string): Promise<EventChangeEntity[]> {
    return (await this.dbRepository.findMany({
      entity: 'event_change',
      where: { eventUuid } as never,
      other: { order: { createdAt: 'DESC' } } as never
    })) as EventChangeEntity[];
  }
}
