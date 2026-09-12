import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { MercadoPagoConfig, PaymentRefund } from 'mercadopago';
import { DBRepository } from '@config/db/db.repository';
import { EnvService } from '@config/env/env.service';
import { EventEntity } from '@config/db/entities/tickets/event.entity';
import { OrderEntity, OrderStatus } from '@config/db/entities/tickets/order.entity';
import { TicketStatus } from '@config/db/entities/tickets/ticket.entity';
import {
  REFUND_ACTIVE_STATUSES,
  RefundKind,
  RefundRequestEntity,
  RefundRequestStatus
} from '@config/db/entities/tickets/refund_request.entity';
import { RefundRequestTicketEntity } from '@config/db/entities/tickets/refund_request_ticket.entity';
import { EmailService } from '@root/shared/auth/services/email.service';
import { UserPermissionService } from '@root/shared/services/userPermissions.service';
import { AdminNotifierService } from '@root/shared/notifications/admin-notifier.service';
import { resolveRefundWindowEndsAt } from '@modules/event/services/core/event-change.helpers';
import {
  IRefundService,
  TRefundEligibility,
  TRefundFilters,
  TRefundRequest,
  TRefundRunResult,
  TRefundableTicket
} from '../contracts/irefund.service';

/** Cuántas solicitudes toma el cron por corrida. */
const QUEUE_BATCH = 50;

type TicketRow = {
  ticketUuid: string;
  ticketNumber: string;
  status: TicketStatus;
  ticketTypeName: string;
  unitPrice: string;
  activeRequest: string | null;
};

/**
 * Solicitudes de reembolso por cambio material (`BR-REFUND-001` a `011`).
 *
 * Tres reglas mandan sobre el resto:
 *
 * - **No hay reembolso "porque sí".** Solo se puede pedir si el evento tuvo un
 *   cambio material comunicado y la ventana sigue abierta (`BR-REFUND-010`).
 * - **El costo de servicio nunca se devuelve** (`BR-REFUND-006`): los montos
 *   salen de `order_item.unitPrice`, que es el valor de la entrada sin fee.
 * - **Nunca se reintenta un refund automáticamente** (`BR-REFUND-011`).
 *   Reintentar sobre uno que en realidad salió devuelve el dinero dos veces.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
/** Días corridos desde la entrega para ejercer el arrepentimiento. */
const WITHDRAWAL_DAYS = 10;
/** Anticipación mínima al inicio del evento. */
const WITHDRAWAL_NOTICE_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class RefundService implements IRefundService {
  private readonly logger = new Logger(RefundService.name);

  constructor(
    @Inject(DBRepository) private readonly dbRepository: DBRepository,
    private readonly dataSource: DataSource,
    private readonly envService: EnvService,
    private readonly emailService: EmailService,
    private readonly userPermission: UserPermissionService,
    private readonly adminNotifier: AdminNotifierService
  ) {}

  // ── Lectura ─────────────────────────────────────────────────────────────────

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }

  /**
   * Entradas de una orden con su precio sin fee y si ya están comprometidas.
   *
   * `activeRequest` sale de un LEFT JOIN contra las solicitudes vivas: un ticket
   * con una solicitud `pending`, `approved`, `processing` o `refunded` no se
   * puede volver a pedir (`BR-REFUND-009`).
   */
  private async loadTickets(orderUuid: string): Promise<TicketRow[]> {
    return this.dataSource
      .createQueryBuilder()
      .select('t.uuid', 'ticketUuid')
      .addSelect('t.ticketNumber', 'ticketNumber')
      .addSelect('t.status', 'status')
      .addSelect('tt.name', 'ticketTypeName')
      .addSelect('oi.unitPrice', 'unitPrice')
      .addSelect('rr.status', 'activeRequest')
      .from('ticket', 't')
      .innerJoin('order_item', 'oi', 'oi.uuid = t.orderItemUuid')
      .innerJoin('ticket_type', 'tt', 'tt.uuid = t.ticketTypeUuid')
      .leftJoin(
        'refund_request_ticket',
        'rrt',
        'rrt.ticketUuid = t.uuid'
      )
      .leftJoin(
        'refund_request',
        'rr',
        'rr.uuid = rrt.refundRequestUuid AND rr.status IN (:...activos)',
        { activos: REFUND_ACTIVE_STATUSES }
      )
      .where('oi.orderUuid = :orderUuid', { orderUuid })
      .orderBy('t.ticketNumber', 'ASC')
      .getRawMany<TicketRow>();
  }

  private blockedReason(row: TicketRow): string | null {
    if (row.activeRequest === 'refunded') return 'Ya fue reembolsada';
    if (row.activeRequest) return 'Ya tiene una solicitud en curso';
    if (row.status === TicketStatus.USED) return 'Ya se usó para entrar';
    if (row.status === TicketStatus.TRANSFERRED) return 'Fue transferida a otra persona';
    if (row.status !== TicketStatus.ACTIVE) return 'No está activa';
    return null;
  }

  /** Si el evento tuvo algún cambio material que se le comunicó a los compradores. */
  /**
   * Plazo del arrepentimiento (`BR-REFUND-007`, Ley 24.240 / Disp. 954/2025).
   *
   * Son tres condiciones **acumulativas**, y las tres tienen que darse:
   *  1. dentro de los 10 días corridos desde la entrega,
   *  2. con al menos 24 horas de anticipación al inicio del evento,
   *  3. sobre entradas sin usar.
   *
   * La entrega se cuenta desde `paidAt`: es cuando se emiten las entradas y
   * sale el email con el comprobante, o sea "lo que ocurra primero" de la norma.
   *
   * Devuelve el motivo del rechazo, o null si puede pedir.
   */
  private withdrawalBlockedReason(order: OrderEntity, event: EventEntity, now: Date): string | null {
    const entregadaEn = order.paidAt ? new Date(order.paidAt) : null;
    if (!entregadaEn) return 'La compra todavía no está acreditada';

    const limiteLegal = new Date(entregadaEn.getTime() + WITHDRAWAL_DAYS * DAY_MS);
    if (now > limiteLegal) {
      return 'Pasaron más de 10 días desde la compra';
    }

    const inicio = new Date(event.startDate);
    const limitePorEvento = new Date(inicio.getTime() - WITHDRAWAL_NOTICE_MS);
    if (now > limitePorEvento) {
      return 'El arrepentimiento se puede ejercer hasta 24 horas antes del evento';
    }

    return null;
  }

  /** Hasta cuándo puede arrepentirse: la más temprana de las dos fechas límite. */
  private withdrawalWindowEndsAt(order: OrderEntity, event: EventEntity): Date | null {
    if (!order.paidAt) return null;
    const limiteLegal = new Date(new Date(order.paidAt).getTime() + WITHDRAWAL_DAYS * DAY_MS);
    const limitePorEvento = new Date(new Date(event.startDate).getTime() - WITHDRAWAL_NOTICE_MS);
    return limiteLegal < limitePorEvento ? limiteLegal : limitePorEvento;
  }

  private async hasMaterialChange(eventUuid: string): Promise<boolean> {
    const row = await this.dataSource
      .createQueryBuilder()
      .select('COUNT(*)', 'n')
      .from('event_change', 'c')
      .where('c.eventUuid = :eventUuid', { eventUuid })
      .andWhere('c.isMaterial = 1')
      .andWhere('c.notifiedAt IS NOT NULL')
      .getRawOne<{ n: string }>();

    return Number(row?.n ?? 0) > 0;
  }

  private async requireOrder(orderUuid: string, loggedUser: string): Promise<OrderEntity> {
    const order = (await this.dbRepository.findOne({
      entity: 'orders',
      where: { uuid: orderUuid }
    })) as OrderEntity | null;

    if (!order) throw new NotFoundException('La orden no existe');

    // Solo el comprador original (`BR-REFUND-001`).
    if (order.userUuid !== loggedUser) {
      throw new ForbiddenException('Solo quien compró puede pedir el reembolso');
    }

    return order;
  }

  async getEligibility(
    orderUuid: string,
    loggedUser: string,
    kind: RefundKind = 'material_change'
  ): Promise<TRefundEligibility> {
    const order = await this.requireOrder(orderUuid, loggedUser);

    const event = (await this.dbRepository.findOne({
      entity: 'event',
      where: { uuid: order.eventUuid }
    })) as EventEntity | null;
    if (!event) throw new NotFoundException('El evento de esta orden no existe');

    const rows = await this.loadTickets(orderUuid);
    const tickets: TRefundableTicket[] = rows.map(r => ({
      ticketUuid: r.ticketUuid,
      ticketNumber: r.ticketNumber,
      ticketTypeName: r.ticketTypeName,
      amount: this.round(Number(r.unitPrice)),
      blockedReason: this.blockedReason(r)
    }));

    const base = {
      orderUuid,
      eventUuid: event.uuid,
      eventName: event.name,
      kind,
      tickets,
      currency: 'ARS'
    };

    if (order.status !== OrderStatus.PAID) {
      return { ...base, canRequest: false, reason: 'La orden no está pagada', windowEndsAt: null };
    }

    // Los dos canales son independientes: el arrepentimiento no necesita que el
    // productor haya cambiado nada, y el de política propia no mira la fecha de
    // compra. Validarlos juntos daría un "no" por el motivo equivocado.
    let windowEndsAt: Date | null;

    if (kind === 'withdrawal') {
      const bloqueo = this.withdrawalBlockedReason(order, event, new Date());
      windowEndsAt = this.withdrawalWindowEndsAt(order, event);
      if (bloqueo) {
        return { ...base, canRequest: false, reason: bloqueo, windowEndsAt };
      }
    } else {
      if (!(await this.hasMaterialChange(event.uuid))) {
        return {
          ...base,
          canRequest: false,
          reason: 'El evento no tuvo cambios que habiliten un reembolso',
          windowEndsAt: null
        };
      }

      windowEndsAt = resolveRefundWindowEndsAt(event.startDate, event.refundWindowExtendedTo);
      if (windowEndsAt <= new Date()) {
        return {
          ...base,
          canRequest: false,
          reason: 'El plazo para pedir el reembolso ya venció',
          windowEndsAt
        };
      }
    }

    const disponibles = tickets.some(t => !t.blockedReason);
    return {
      ...base,
      canRequest: disponibles,
      reason: disponibles ? null : 'No te quedan entradas para reembolsar',
      windowEndsAt
    };
  }

  // ── Alta ────────────────────────────────────────────────────────────────────

  async createRequest(
    orderUuid: string,
    ticketUuids: string[],
    loggedUser: string,
    kind: RefundKind = 'material_change'
  ): Promise<TRefundRequest> {
    if (!ticketUuids?.length) {
      throw new BadRequestException('Elegí al menos una entrada');
    }

    const eligibility = await this.getEligibility(orderUuid, loggedUser, kind);
    if (!eligibility.canRequest) {
      throw new BadRequestException(eligibility.reason ?? 'No se puede pedir el reembolso');
    }

    const pedidos = [...new Set(ticketUuids)];
    const disponibles = new Map(
      eligibility.tickets.filter(t => !t.blockedReason).map(t => [t.ticketUuid, t])
    );

    for (const uuid of pedidos) {
      const ticket = disponibles.get(uuid);
      if (!ticket) {
        const conocido = eligibility.tickets.find(t => t.ticketUuid === uuid);
        throw new BadRequestException(
          conocido
            ? `La entrada ${conocido.ticketNumber} no se puede reembolsar: ${conocido.blockedReason}`
            : 'Alguna de las entradas no pertenece a esta orden'
        );
      }
    }

    const mpPaymentId = await this.findApprovedPaymentId(orderUuid);
    const amount = this.round(
      pedidos.reduce((sum, uuid) => sum + (disponibles.get(uuid)?.amount ?? 0), 0)
    );
    if (!(amount > 0)) {
      throw new BadRequestException('El monto a reembolsar es cero');
    }

    const requestUuid = uuidv4();
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Se bloquean las filas de los tickets: sin esto, dos pedidos simultáneos
      // sobre la misma entrada pasan los dos y se reembolsa dos veces.
      const locked = await queryRunner.manager.query(
        `SELECT uuid FROM ticket WHERE uuid IN (${pedidos.map(() => '?').join(',')}) FOR UPDATE`,
        pedidos
      );
      if (locked.length !== pedidos.length) {
        throw new BadRequestException('Alguna de las entradas ya no existe');
      }

      // Se revalida adentro del lock: entre el chequeo y acá pudo entrar otra.
      const yaPedidos = await queryRunner.manager.query(
        `SELECT rrt.ticketUuid FROM refund_request_ticket rrt
           INNER JOIN refund_request rr ON rr.uuid = rrt.refundRequestUuid
          WHERE rrt.ticketUuid IN (${pedidos.map(() => '?').join(',')})
            AND rr.status IN (${REFUND_ACTIVE_STATUSES.map(() => '?').join(',')})`,
        [...pedidos, ...REFUND_ACTIVE_STATUSES]
      );
      if (yaPedidos.length > 0) {
        throw new BadRequestException(
          'Alguna de las entradas ya tiene una solicitud en curso'
        );
      }

      const request = new RefundRequestEntity();
      request.uuid = requestUuid;
      request.orderUuid = orderUuid;
      request.eventUuid = eligibility.eventUuid;
      request.userUuid = loggedUser;
      request.status = 'pending';
      request.kind = kind;
      request.amount = amount;
      request.currency = 'ARS';
      request.mpPaymentId = mpPaymentId;
      request.requestedAt = new Date();
      request.attempts = 0;

      await queryRunner.manager.save(RefundRequestEntity, request);

      const items = pedidos.map(uuid => {
        const item = new RefundRequestTicketEntity();
        item.uuid = uuidv4();
        item.refundRequestUuid = requestUuid;
        item.ticketUuid = uuid;
        item.amount = disponibles.get(uuid)!.amount;
        return item;
      });
      await queryRunner.manager.save(RefundRequestTicketEntity, items);

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    return this.getRequest(requestUuid);
  }

  /**
   * Pago aprobado de la orden: es sobre el que MP ejecuta el reintegro.
   *
   * Se busca el pago y no se guarda en la orden porque una orden puede tener
   * varios intentos y solo uno queda aprobado.
   */
  private async findApprovedPaymentId(orderUuid: string): Promise<string> {
    const row = await this.dataSource
      .createQueryBuilder()
      .select('p.providerPaymentId', 'id')
      .from('payment', 'p')
      .where('p.orderUuid = :orderUuid', { orderUuid })
      .andWhere("p.status = 'approved'")
      .orderBy('p.createdAt', 'DESC')
      .limit(1)
      .getRawOne<{ id: string }>();

    if (!row?.id) {
      throw new BadRequestException(
        'No encontramos el pago de esta orden. Escribinos para resolverlo a mano.'
      );
    }
    return String(row.id);
  }

  // ── Consultas ───────────────────────────────────────────────────────────────

  private async getRequest(uuid: string): Promise<TRefundRequest> {
    const [row] = await this.queryRequests({ uuid });
    if (!row) throw new NotFoundException('La solicitud no existe');
    return row;
  }

  private async queryRequests(filter: {
    uuid?: string;
    userUuid?: string;
    eventUuids?: string[] | null;
    status?: RefundRequestStatus;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
  }): Promise<TRefundRequest[]> {
    const qb = this.dataSource
      .createQueryBuilder()
      .select('r.uuid', 'uuid')
      .addSelect('r.orderUuid', 'orderUuid')
      .addSelect('o.orderNumber', 'orderNumber')
      .addSelect('r.eventUuid', 'eventUuid')
      .addSelect('e.name', 'eventName')
      .addSelect("CONCAT(u.firstName, ' ', u.lastName)", 'buyerName')
      .addSelect('u.email', 'buyerEmail')
      .addSelect('r.status', 'status')
      .addSelect('r.kind', 'kind')
      .addSelect('r.amount', 'amount')
      .addSelect('r.currency', 'currency')
      .addSelect('r.mpPaymentId', 'mpPaymentId')
      .addSelect('r.resolutionReason', 'resolutionReason')
      .addSelect('r.uniqueSequenceNumber', 'uniqueSequenceNumber')
      .addSelect('r.amountRefundedToPayer', 'amountRefundedToPayer')
      .addSelect('r.attempts', 'attempts')
      .addSelect('r.requestedAt', 'requestedAt')
      .addSelect('r.resolvedAt', 'resolvedAt')
      .from('refund_request', 'r')
      .innerJoin('orders', 'o', 'o.uuid = r.orderUuid')
      .innerJoin('event', 'e', 'e.uuid = r.eventUuid')
      .innerJoin('user', 'u', 'u.uuid = r.userUuid')
      .orderBy('r.requestedAt', 'DESC');

    if (filter.uuid) qb.andWhere('r.uuid = :uuid', { uuid: filter.uuid });
    if (filter.userUuid) qb.andWhere('r.userUuid = :userUuid', { userUuid: filter.userUuid });
    if (filter.eventUuids) {
      if (filter.eventUuids.length === 0) return [];
      qb.andWhere('r.eventUuid IN (:...eventUuids)', { eventUuids: filter.eventUuids });
    }
    if (filter.status) qb.andWhere('r.status = :status', { status: filter.status });
    if (filter.dateFrom) {
      qb.andWhere('r.requestedAt >= :from', { from: `${filter.dateFrom} 00:00:00` });
    }
    if (filter.dateTo) {
      qb.andWhere('r.requestedAt <= :to', { to: `${filter.dateTo} 23:59:59` });
    }
    const searchTerm = filter.search?.trim();
    if (searchTerm) {
      qb.andWhere(
        `(o.orderNumber LIKE :q
          OR u.email LIKE :q
          OR CONCAT(u.firstName, ' ', u.lastName) LIKE :q
          OR e.name LIKE :q
          OR EXISTS (
            SELECT 1 FROM refund_request_ticket rrt
            INNER JOIN ticket t ON t.uuid = rrt.ticketUuid
            WHERE rrt.refundRequestUuid = r.uuid AND t.ticketNumber LIKE :q
          ))`,
        { q: `%${searchTerm}%` }
      );
    }

    const rows = await qb.getRawMany();
    if (!rows.length) return [];

    const tickets = await this.dataSource
      .createQueryBuilder()
      .select('rrt.refundRequestUuid', 'requestUuid')
      .addSelect('rrt.ticketUuid', 'ticketUuid')
      .addSelect('rrt.amount', 'amount')
      .addSelect('t.ticketNumber', 'ticketNumber')
      .from('refund_request_ticket', 'rrt')
      .innerJoin('ticket', 't', 't.uuid = rrt.ticketUuid')
      .where('rrt.refundRequestUuid IN (:...ids)', { ids: rows.map(r => r.uuid) })
      .getRawMany<{
        requestUuid: string;
        ticketUuid: string;
        amount: string;
        ticketNumber: string;
      }>();

    const byRequest = new Map<string, TRefundRequest['tickets']>();
    for (const t of tickets) {
      const list = byRequest.get(t.requestUuid) ?? [];
      list.push({
        ticketUuid: t.ticketUuid,
        ticketNumber: t.ticketNumber,
        amount: this.round(Number(t.amount))
      });
      byRequest.set(t.requestUuid, list);
    }

    return rows.map(r => ({
      uuid: r.uuid,
      orderUuid: r.orderUuid,
      orderNumber: r.orderNumber,
      eventUuid: r.eventUuid,
      eventName: r.eventName,
      buyerName: String(r.buyerName ?? '').trim(),
      buyerEmail: r.buyerEmail,
      status: r.status,
      kind: r.kind,
      amount: this.round(Number(r.amount)),
      currency: r.currency,
      mpPaymentId: r.mpPaymentId,
      resolutionReason: r.resolutionReason,
      uniqueSequenceNumber: r.uniqueSequenceNumber,
      amountRefundedToPayer:
        r.amountRefundedToPayer === null ? null : this.round(Number(r.amountRefundedToPayer)),
      attempts: Number(r.attempts ?? 0),
      requestedAt: r.requestedAt,
      resolvedAt: r.resolvedAt,
      tickets: byRequest.get(r.uuid) ?? []
    }));
  }

  async listMine(loggedUser: string): Promise<TRefundRequest[]> {
    return this.queryRequests({ userUuid: loggedUser });
  }

  async listForProducer(
    filters: TRefundFilters,
    loggedUser: string,
    role: string | null
  ): Promise<TRefundRequest[]> {
    // El Admin ve todo; el productor, solo los eventos de sus organizaciones.
    let eventUuids: string[] | null = null;

    if (role !== 'Administrador') {
      const rows = await this.dataSource
        .createQueryBuilder()
        .select('e.uuid', 'uuid')
        .from('event', 'e')
        .innerJoin('user_organization', 'uo', 'uo.organizationUuid = e.organizationUuid')
        .where('uo.userUuid = :loggedUser', { loggedUser })
        .andWhere('uo.isDeleted IS NULL')
        .getRawMany<{ uuid: string }>();
      eventUuids = rows.map(r => r.uuid);
    }

    if (filters.eventUuid) {
      if (eventUuids && !eventUuids.includes(filters.eventUuid)) return [];
      eventUuids = [filters.eventUuid];
    }

    return this.queryRequests({
      eventUuids,
      status: filters.status,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      search: filters.search
    });
  }

  // ── Cron (`BR-REFUND-011`) ──────────────────────────────────────────────────

  private mpRefundClient(): PaymentRefund {
    const accessToken = this.envService.get('MERCADOPAGO_ACCESS_TOKEN') ?? '';
    return new PaymentRefund(new MercadoPagoConfig({ accessToken }));
  }

  private async setStatus(
    uuid: string,
    status: RefundRequestStatus,
    extra: Partial<RefundRequestEntity> = {}
  ): Promise<void> {
    const terminal = status === 'refunded' || status === 'rejected' || status === 'failed';
    await this.dbRepository.update({
      entity: 'refund_request',
      where: { uuid },
      data: { status, resolvedAt: terminal ? new Date() : null, ...extra }
    });
  }

  /**
   * Revalida una solicitud antes de pagarla. Entre que el comprador la pidió y
   * que el cron la toma pudo pasar de todo: que use la entrada, que la ventana
   * cierre, que otra solicitud la haya cubierto.
   */
  private async evaluate(request: TRefundRequest): Promise<string | null> {
    const event = (await this.dbRepository.findOne({
      entity: 'event',
      where: { uuid: request.eventUuid }
    })) as EventEntity | null;
    if (!event) return 'El evento ya no existe';

    // Se revalida lo mismo que al pedir, pero contra el canal correcto: un
    // arrepentimiento no se rechaza por falta de cambio material, y uno de
    // política propia no se rechaza por la fecha de compra.
    if (request.kind === 'withdrawal') {
      const order = (await this.dbRepository.findOne({
        entity: 'orders',
        where: { uuid: request.orderUuid }
      })) as OrderEntity | null;
      if (!order) return 'La orden ya no existe';

      // Contra `requestedAt` y no contra ahora: si pidió en plazo, el tiempo
      // que tardó el cron en levantarlo no puede jugarle en contra.
      const bloqueo = this.withdrawalBlockedReason(order, event, request.requestedAt);
      if (bloqueo) return bloqueo;
    } else {
      if (!(await this.hasMaterialChange(event.uuid))) {
        return 'El evento no tiene cambios que habiliten un reembolso';
      }

      const window = resolveRefundWindowEndsAt(event.startDate, event.refundWindowExtendedTo);
      if (window <= request.requestedAt) {
        return 'El plazo ya había vencido cuando se pidió';
      }
    }

    const usados = await this.dataSource
      .createQueryBuilder()
      .select('COUNT(*)', 'n')
      .from('refund_request_ticket', 'rrt')
      .innerJoin('ticket', 't', 't.uuid = rrt.ticketUuid')
      .where('rrt.refundRequestUuid = :uuid', { uuid: request.uuid })
      .andWhere("t.status <> 'active'")
      .getRawOne<{ n: string }>();

    if (Number(usados?.n ?? 0) > 0) {
      return 'Alguna de las entradas se usó o dejó de estar activa';
    }

    return null;
  }

  /** Ejecuta el reintegro en MP. No decide nada: solo traduce la respuesta. */
  private async executeRefund(request: TRefundRequest): Promise<{
    status: RefundRequestStatus;
    extra: Partial<RefundRequestEntity>;
  }> {
    try {
      const refund = await this.mpRefundClient().create({
        payment_id: request.mpPaymentId,
        body: { amount: request.amount },
        // El uuid de la solicitud como clave: aunque alguien reintente, MP no
        // duplica el reintegro.
        requestOptions: { idempotencyKey: request.uuid }
      });

      const extra: Partial<RefundRequestEntity> = {
        mpRefundId: refund?.id ? String(refund.id) : null,
        uniqueSequenceNumber: refund?.unique_sequence_number ?? null,
        amountRefundedToPayer:
          refund?.amount_refunded_to_payer === undefined
            ? null
            : Number(refund.amount_refunded_to_payer)
      };

      if (refund?.status === 'approved') return { status: 'refunded', extra };
      if (refund?.status === 'in_process') return { status: 'processing', extra };

      return {
        status: 'failed',
        extra: { ...extra, resolutionReason: `Mercado Pago respondió: ${refund?.status ?? 'sin estado'}` }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error llamando a Mercado Pago';
      return { status: 'failed', extra: { resolutionReason: message.slice(0, 500) } };
    }
  }

  /** Marca como reembolsadas las entradas de una solicitud que se pagó. */
  private async markTicketsRefunded(requestUuid: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE ticket SET status = 'refunded'
        WHERE uuid IN (SELECT ticketUuid FROM refund_request_ticket WHERE refundRequestUuid = ?)`,
      [requestUuid]
    );
  }

  async processQueue(): Promise<TRefundRunResult> {
    const result: TRefundRunResult = {
      evaluated: 0,
      approved: 0,
      rejected: 0,
      refunded: 0,
      processing: 0,
      failed: 0
    };

    // 1. Las nuevas: se evalúan y, si pasan, se pagan.
    const pendientes = await this.queryRequests({ status: 'pending' });
    for (const request of pendientes.slice(0, QUEUE_BATCH)) {
      result.evaluated++;

      const motivo = await this.evaluate(request);
      if (motivo) {
        await this.setStatus(request.uuid, 'rejected', { resolutionReason: motivo });
        result.rejected++;
        await this.notifyResult(request, 'rejected', motivo);
        continue;
      }

      result.approved++;
      await this.setStatus(request.uuid, 'approved');

      const { status, extra } = await this.executeRefund(request);
      await this.setStatus(request.uuid, status, { ...extra, attempts: 1 });

      if (status === 'refunded') {
        await this.markTicketsRefunded(request.uuid);
        result.refunded++;
        await this.notifyResult(request, 'refunded', null);
      } else if (status === 'processing') {
        result.processing++;
      } else {
        result.failed++;
        this.logger.warn(
          `Refund fallido ${request.uuid}: ${extra.resolutionReason ?? 'sin detalle'}`
        );
        await this.notifyAdminsRefundFailed(request, extra.resolutionReason);
      }
    }

    // 2. Las que MP dejó en curso: se CONSULTAN, nunca se reenvían.
    const enCurso = await this.queryRequests({ status: 'processing' });
    for (const request of enCurso.slice(0, QUEUE_BATCH)) {
      const resuelta = await this.checkProcessing(request);
      if (resuelta === 'refunded') {
        result.refunded++;
      } else if (resuelta === 'failed') {
        result.failed++;
      } else {
        result.processing++;
      }
    }

    return result;
  }

  /**
   * Consulta en MP cómo terminó un refund que quedó `in_process`.
   *
   * **Consulta, no reenvía.** Reenviarlo sería pagar dos veces.
   */
  private async checkProcessing(request: TRefundRequest): Promise<RefundRequestStatus> {
    const row = (await this.dbRepository.findOne({
      entity: 'refund_request',
      where: { uuid: request.uuid }
    })) as RefundRequestEntity | null;

    if (!row?.mpRefundId) return 'processing';

    try {
      const refund = await this.mpRefundClient().get({
        payment_id: request.mpPaymentId,
        refund_id: row.mpRefundId
      });

      if (refund?.status === 'approved') {
        await this.setStatus(request.uuid, 'refunded', {
          amountRefundedToPayer:
            refund?.amount_refunded_to_payer === undefined
              ? null
              : Number(refund.amount_refunded_to_payer)
        });
        await this.markTicketsRefunded(request.uuid);
        await this.notifyResult(request, 'refunded', null);
        return 'refunded';
      }

      if (refund?.status && refund.status !== 'in_process') {
        const motivo = `Mercado Pago cerró el reintegro como: ${refund.status}`;
        await this.setStatus(request.uuid, 'failed', { resolutionReason: motivo });
        await this.notifyAdminsRefundFailed(request, motivo);
        return 'failed';
      }
    } catch (error) {
      // Un fallo al consultar no cambia el estado: la solicitud sigue en curso
      // y se vuelve a mirar en la corrida siguiente.
      this.logger.warn(
        `No se pudo consultar el refund ${row.mpRefundId}: ${
          error instanceof Error ? error.message : error
        }`
      );
    }

    return 'processing';
  }

  async retryFailed(requestUuid: string, loggedUser: string): Promise<TRefundRequest> {
    const isAdmin = await this.userPermission.userPermission(loggedUser);
    if (!isAdmin) {
      throw new ForbiddenException('Solo un administrador puede reintentar un reembolso');
    }

    const request = await this.getRequest(requestUuid);
    if (request.status !== 'failed') {
      throw new BadRequestException(
        `Solo se reintenta una solicitud fallida. Esta está en "${request.status}".`
      );
    }

    const row = (await this.dbRepository.findOne({
      entity: 'refund_request',
      where: { uuid: requestUuid }
    })) as RefundRequestEntity;

    const { status, extra } = await this.executeRefund(request);
    await this.setStatus(requestUuid, status, {
      ...extra,
      attempts: Number(row.attempts ?? 0) + 1
    });

    if (status === 'refunded') {
      await this.markTicketsRefunded(requestUuid);
      await this.notifyResult(request, 'refunded', null);
    } else if (status === 'failed') {
      // Un reintento que vuelve a fallar necesita el mismo aviso: el Admin que
      // lo tocó puede no ser el que lo retome, y ya van dos intentos.
      await this.notifyAdminsRefundFailed(request, extra.resolutionReason);
    }

    return this.getRequest(requestUuid);
  }

  /**
   * Levanta la mano cuando un reintegro no salió (`BR-REFUND-011`).
   *
   * Una solicitud en `failed` es el único estado que **no avanza solo**: el
   * cron no reintenta nunca —reintentar a ciegas devuelve el dinero dos
   * veces—, así que se queda quieta hasta que un Admin la mire. Sin este aviso
   * la única forma de enterarse era que alguien abriera `/admin/refunds` por
   * su cuenta, con plata del comprador sin volver mientras tanto.
   *
   * **No se le avisa al comprador.** Del otro lado no hay nada que hacer: el
   * problema es entre la plataforma y Mercado Pago, y el aviso solo generaría
   * un reclamo sobre algo que ya estamos resolviendo. Cuando el reintento
   * salga, le llega el mail de reembolso aprobado de siempre.
   */
  private async notifyAdminsRefundFailed(
    request: TRefundRequest,
    motivo: string | null | undefined
  ): Promise<void> {
    await this.adminNotifier.notifyAdmins(
      `Reembolso fallido — ${request.eventName}`,
      `No se pudo reintegrar ${request.currency} ${request.amount} a ${request.buyerName} ` +
        `(${request.buyerEmail}). Motivo: ${motivo ?? 'sin detalle'}. ` +
        'Verificá en Mercado Pago si el reintegro se acreditó antes de reintentar desde Reembolsos.'
    );
  }

  // ── Aviso al comprador ──────────────────────────────────────────────────────

  /**
   * Email con el resultado (`BR-REFUND-004`). No corta el flujo si falla: la
   * solicitud ya quedó resuelta en la base.
   */
  private async notifyResult(
    request: TRefundRequest,
    status: 'refunded' | 'rejected',
    motivo: string | null
  ): Promise<void> {
    const appUrl = (this.envService.get('APP_URL') ?? '').replace(/\/$/, '');

    try {
      await this.emailService.sendTemplateEmail(
        'refund-result',
        {
          firstName: request.buyerName.split(' ')[0] ?? '',
          eventName: request.eventName,
          approved: status === 'refunded',
          // Lo que MP dice que volvió, si ya lo confirmó; si no, lo aprobado.
          // No suelen diferir, pero cuando difieren manda el número de MP: es
          // el que el comprador va a ver en su cuenta.
          amount: request.amountRefundedToPayer ?? request.amount,
          currency: request.currency,
          reason: motivo,
          // El plural se arma acá: Handlebars no trae un helper de comparación.
          ticketLabel:
            request.tickets.length === 1
              ? '1 entrada'
              : `${request.tickets.length} entradas`,
          ticketsUrl: appUrl ? `${appUrl}/client/tickets` : null
        },
        {
          to: request.buyerEmail,
          subject:
            status === 'refunded'
              ? `Reembolso aprobado — ${request.eventName}`
              : `Sobre tu pedido de reembolso — ${request.eventName}`
        }
      );
    } catch (error) {
      this.logger.warn(
        `No se pudo avisar el resultado de ${request.uuid}: ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  }
}
