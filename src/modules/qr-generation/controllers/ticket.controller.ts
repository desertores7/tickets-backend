import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  Post,
  UnprocessableEntityException
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Queue } from 'bullmq';
import { DataSource, In, LessThan, MoreThanOrEqual } from 'typeorm';
import { AdminAuth } from '@root/shared/auth/decorator/admin-auth.decorator';
import { UserAuth } from '@root/shared/auth/decorator/user-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import { ApiFilter, FilterParams, IFiltersParams } from '@root/shared/decorators/filter-query.decorator';
import { ApiPagination, IPaginationParams, PaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { StorageService } from '@root/shared/services/storage.service';
import {
  QUEUE_NAMES,
  GenerateQrJobData,
  SendOrderTicketsEmailJobData
} from '@config/redis/bull-jobs.types';
import { RedisService } from '@config/redis/redis.service';
import { OrderEntity, OrderStatus } from '@config/db/entities/tickets/order.entity';
import { TicketEntity, TicketStatus } from '@config/db/entities/tickets/ticket.entity';
import {
  REFUND_ACTIVE_STATUSES,
  RefundRequestStatus
} from '@config/db/entities/tickets/refund_request.entity';
import {
  MY_TICKET_STATUS,
  MY_TICKET_TIMEFRAME,
  myTicketFilters,
  TMyTicketStatus,
  TMyTicketTimeframe
} from './const/my-ticket.filters';
import {
  GetTicketData,
  GetTicketEventData,
  GetTicketOrderData,
  GetTicketResponse,
  GetTicketTypeData
} from './dtos/get-ticket/get-ticket.response';
import { GetMyTicketsResponse, TicketSummaryData, TicketSummaryResponse } from './dtos/get-my-tickets/get-my-tickets.response';

function resolveTicketStatusWhere(
  raw: string[] | undefined
): TicketStatus | ReturnType<typeof In> | undefined {
  const values = (raw ?? []).filter(Boolean);
  if (values.length === 0) {
    return In([TicketStatus.ACTIVE, TicketStatus.USED]);
  }
  if (values.includes('all')) return undefined;

  const allowed = values.filter((value): value is Exclude<TMyTicketStatus, 'all'> =>
    value === 'active' || value === 'used'
  );
  if (allowed.length === 0) {
    throw new BadRequestException(`status debe ser uno de: ${MY_TICKET_STATUS.join(', ')}`);
  }

  const mapped = allowed.map(value => (value === 'active' ? TicketStatus.ACTIVE : TicketStatus.USED));
  return mapped.length === 1 ? mapped[0] : In(mapped);
}

function resolveTicketTimeframe(raw: string[] | undefined): TMyTicketTimeframe {
  const value = raw?.[0] ?? 'all';
  if (!MY_TICKET_TIMEFRAME.includes(value as TMyTicketTimeframe)) {
    throw new BadRequestException(`timeframe debe ser uno de: ${MY_TICKET_TIMEFRAME.join(', ')}`);
  }
  return value as TMyTicketTimeframe;
}

// ── User-facing ticket endpoints ─────────────────────────────────────────────

@ApiTags('Compra — Tickets')
@Controller('tickets')
export class TicketController {
  private readonly logger = new Logger(TicketController.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly storageService: StorageService,
    @InjectQueue(QUEUE_NAMES.TICKETS) private readonly ticketsQueue: Queue
  ) {}

  /**
   * Estado del reembolso por entrada, para las que lo tengan.
   *
   * Va en una consulta aparte y no como join del listado: es una relación
   * uno-a-muchos (un ticket puede haber sido pedido y rechazado antes de
   * volver a pedirse) y meterla en el `findAndCount` rompería la paginación.
   *
   * Solo interesan los estados **vivos**: un pedido rechazado deja la entrada
   * como estaba, así que no tiene nada que mostrar.
   */
  private async loadRefundStatuses(
    ticketUuids: string[]
  ): Promise<Map<string, RefundRequestStatus>> {
    const map = new Map<string, RefundRequestStatus>();
    if (!ticketUuids.length) return map;

    const rows = await this.dataSource
      .createQueryBuilder()
      .select('rrt.ticketUuid', 'ticketUuid')
      .addSelect('rr.status', 'status')
      .from('refund_request_ticket', 'rrt')
      .innerJoin('refund_request', 'rr', 'rr.uuid = rrt.refundRequestUuid')
      .where('rrt.ticketUuid IN (:...ticketUuids)', { ticketUuids })
      .andWhere('rr.status IN (:...statuses)', { statuses: REFUND_ACTIVE_STATUSES })
      .getRawMany<{ ticketUuid: string; status: RefundRequestStatus }>();

    for (const row of rows) map.set(row.ticketUuid, row.status);
    return map;
  }

  // ---------------------------------------------------------------------------
  // GET /api/tickets/me
  // ---------------------------------------------------------------------------

  @UserAuth(null, GetMyTicketsResponse)
  @ApiOperation({
    summary: 'Listar mis tickets',
    description:
      'Listado paginado de entradas del usuario autenticado.\n' +
      '- `page` / `limit`: paginación (`@PaginationParams`).\n' +
      '- `status`: active | used | all. Sin valor: activas y usadas.\n' +
      '- `timeframe`: upcoming | past | all. Sin valor: todas.'
  })
  @ApiResponse({ status: 200, type: GetMyTicketsResponse, description: 'Listado paginado de tickets.' })
  @ApiResponse({ status: 401, description: 'JWT token missing, invalid or expired.' })
  @ApiPagination()
  @ApiFilter(myTicketFilters)
  @HttpCode(200)
  @Get('me')
  async getMyTickets(
    @PaginationParams() pagination: IPaginationParams,
    @FilterParams(myTicketFilters) filters: IFiltersParams<typeof myTicketFilters>,
    @User() userId: string
  ): Promise<GetMyTicketsResponse> {
    const { page, limit } = pagination;
    const statusWhere = resolveTicketStatusWhere(filters.status);
    const timeframe = resolveTicketTimeframe(filters.timeframe);

    const now = new Date();
    const eventWhere =
      timeframe === 'upcoming'
        ? { endDate: MoreThanOrEqual(now) }
        : timeframe === 'past'
          ? { endDate: LessThan(now) }
          : undefined;

    // Próximas de la más cercana a la más lejana; pasadas de la más reciente
    // hacia atrás. Sin corte temporal manda la fecha de compra.
    const order =
      timeframe === 'upcoming'
        ? ({ event: { startDate: 'ASC' } } as const)
        : timeframe === 'past'
          ? ({ event: { startDate: 'DESC' } } as const)
          : ({ createdAt: 'DESC' } as const);

    const [tickets, total] = await this.dataSource.getRepository(TicketEntity).findAndCount({
      where: {
        userUuid: userId,
        ...(statusWhere ? { status: statusWhere } : {}),
        ...(eventWhere ? { event: eventWhere } : {})
      },
      relations: { orderItem: { order: true }, event: true, ticketType: true },
      order,
      skip: (page - 1) * limit,
      take: limit
    });

    const refundByTicket = await this.loadRefundStatuses(tickets.map(t => t.uuid));

    const items = tickets.map(t => {
      const data: TicketSummaryData = {
        uuid: t.uuid,
        ticketNumber: t.ticketNumber,
        status: t.status,
        qrUrl: this.storageService.toPublicUrl(t.qrUrl),
        pdfUrl: this.storageService.toPublicUrl(t.pdfUrl),
        eventUuid: t.event.uuid,
        eventName: t.event.name,
        eventDate: t.event.startDate,
        eventEndDate: t.event.endDate,
        eventBannerUrl: t.event.bannerUrl ?? null,
        venueName: t.event.venueName,
        venueCity: t.event.venueCity ?? null,
        ticketTypeName: t.ticketType.name,
        ticketTypePrice: t.ticketType.price !== undefined ? Number(t.ticketType.price) : null,
        // La orden ya viene en la relacion: se usa para linkear la compra.
        orderUuid: t.orderItem?.order?.uuid ?? null,
        orderNumber: t.orderItem?.order?.orderNumber ?? null,
        refundStatus: refundByTicket.get(t.uuid) ?? null,
        createdAt: t.createdAt
      };
      return new TicketSummaryResponse(data);
    });

    const meta = new PaginationMetaResponse({ total, page, limit });
    return new GetMyTicketsResponse(items, meta);
  }

  // ---------------------------------------------------------------------------
  // GET /api/tickets/:ticketId
  // ---------------------------------------------------------------------------

  @UserAuth(null, GetTicketResponse)
  @ApiOperation({
    summary: 'Obtener ticket',
    description:
      'Returns the full detail of a ticket including event info, ticket type, and order reference. ' +
      'Only the owner of the ticket can access it.'
  })
  @ApiParam({ name: 'ticketId', description: 'Ticket UUID.', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({ status: 200, type: GetTicketResponse, description: 'Ticket detail.' })
  @ApiResponse({ status: 401, description: 'JWT token missing, invalid or expired.' })
  @ApiResponse({ status: 403, description: 'Ticket does not belong to the authenticated user.' })
  @ApiResponse({ status: 404, description: 'Ticket not found.' })
  @HttpCode(200)
  @Get(':ticketId')
  async getTicketById(@Param('ticketId') ticketId: string, @User() userId: string): Promise<GetTicketResponse> {
    const ticket = await this.dataSource.getRepository(TicketEntity).findOne({
      where: { uuid: ticketId },
      relations: { orderItem: { order: true }, event: true, ticketType: true }
    });

    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.userUuid !== userId) throw new ForbiddenException('Access denied');

    const event: GetTicketEventData = {
      uuid: ticket.event.uuid,
      name: ticket.event.name,
      startDate: ticket.event.startDate,
      endDate: ticket.event.endDate,
      bannerUrl: ticket.event.bannerUrl ?? null,
      venueName: ticket.event.venueName,
      venueCity: ticket.event.venueCity
    };

    const ticketType: GetTicketTypeData = {
      uuid: ticket.ticketType.uuid,
      name: ticket.ticketType.name,
      price: ticket.ticketType.price
    };

    const order: GetTicketOrderData = {
      uuid: ticket.orderItem.order.uuid,
      orderNumber: ticket.orderItem.order.orderNumber
    };

    // El detalle también lo necesita, no solo el listado: se entra acá por link
    // directo a una entrada, y sin este dato la pantalla no sabe que hay un
    // reembolso en curso y muestra el QR igual.
    const refundStatus = (await this.loadRefundStatuses([ticket.uuid])).get(ticket.uuid) ?? null;

    const data: GetTicketData = {
      uuid: ticket.uuid,
      ticketNumber: ticket.ticketNumber,
      status: ticket.status,
      qrUrl: this.storageService.toPublicUrl(ticket.qrUrl),
      pdfUrl: this.storageService.toPublicUrl(ticket.pdfUrl),
      qrCode: ticket.qrCode,
      refundStatus,
      checkedInAt: ticket.checkedInAt,
      event,
      ticketType,
      order,
      createdAt: ticket.createdAt
    };

    return new GetTicketResponse(data);
  }
}

// ── Admin ticket endpoints ────────────────────────────────────────────────────

@ApiTags('Admin — Tickets')
@Controller('admin/tickets')
export class AdminTicketController {
  private readonly logger = new Logger(AdminTicketController.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly storageService: StorageService,
    private readonly redisService: RedisService,
    @InjectQueue(QUEUE_NAMES.TICKETS) private readonly ticketsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationsQueue: Queue
  ) {}

  // ---------------------------------------------------------------------------
  // POST /api/admin/tickets/orders/:orderId/resend-email
  // ---------------------------------------------------------------------------

  @AdminAuth(null, null)
  @ApiOperation({
    summary: 'Reenviar email de la compra',
    description:
      'Vuelve a mandarle al comprador el email con **todas** las entradas de la orden adjuntas. ' +
      'Para cuando no le llegó nada: un SMTP caído, un rebote, o el comprador que lo borró.\n\n' +
      'Libera el candado de idempotencia antes de encolar — sin eso el reenvío se descartaría como ' +
      'duplicado del envío original.\n\n' +
      'Si a alguna entrada le falta el PDF en el disco responde 422: primero hay que regenerarla, ' +
      'porque el email sale con todas o no sale.'
  })
  @ApiParam({ name: 'orderId', description: 'UUID de la orden.' })
  @ApiResponse({ status: 202, description: 'Reenvío encolado. Sale en unos segundos.' })
  @ApiResponse({ status: 404, description: 'Orden no encontrada.' })
  @ApiResponse({ status: 422, description: 'La orden no está pagada, o alguna entrada no tiene su PDF generado.' })
  @HttpCode(202)
  @Post('orders/:orderId/resend-email')
  async resendOrderEmail(@Param('orderId') orderId: string): Promise<{ message: string; orderId: string }> {
    const order = await this.dataSource
      .getRepository(OrderEntity)
      .findOne({ where: { uuid: orderId }, relations: { items: true } });

    if (!order) throw new NotFoundException('Orden no encontrada');

    if (order.status !== OrderStatus.PAID) {
      throw new UnprocessableEntityException(
        `Solo se reenvía el email de una orden pagada. Esta está en "${order.status}".`
      );
    }

    // El email lleva los PDFs adjuntos: si falta uno, el envío falla entero.
    // Mejor decirlo acá que dejar que el job reintente y muera en silencio.
    const tickets = await this.dataSource.getRepository(TicketEntity).find({
      where: { orderItemUuid: In(order.items.map((i: { uuid: string }) => i.uuid)) }
    });

    if (tickets.length === 0) {
      throw new UnprocessableEntityException('La orden no tiene entradas emitidas');
    }

    const faltantes: string[] = [];
    for (const ticket of tickets) {
      const existe =
        ticket.pdfUrl !== null &&
        (await this.storageService.fileExists(
          this.storageService.resolveAbsolutePath('tickets/pdf', `${ticket.uuid}.pdf`)
        ));
      if (!existe) faltantes.push(ticket.ticketNumber);
    }

    if (faltantes.length > 0) {
      throw new UnprocessableEntityException(
        `Faltan los PDF de: ${faltantes.join(', ')}. Regenerá esas entradas y volvé a intentar.`
      );
    }

    // Sin esto el processor lo descarta: el envío original ya dejó la marca.
    await this.redisService.deleteKey(`order-tickets-email:${order.uuid}`);

    const jobData: SendOrderTicketsEmailJobData = { orderId: order.uuid };
    await this.notificationsQueue.add('send-order-tickets-email', jobData, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 }
    });

    this.logger.log(`Reenvío del email encolado para la orden ${order.orderNumber}`);

    return { message: 'Reenvío encolado', orderId: order.uuid };
  }

  // ---------------------------------------------------------------------------
  // POST /api/admin/tickets/:ticketId/regenerate-qr
  // ---------------------------------------------------------------------------

  @AdminAuth(null, null)
  @ApiOperation({
    summary: 'Regenerar QR del ticket',
    description:
      'Clears existing QR/PDF assets for a ticket and enqueues a new `generate-qr` job. ' +
      'The operation is asynchronous — HTTP 202 is returned immediately; the new QR image and PDF ' +
      'will be available at their URLs once the job completes (usually within seconds).\n\n' +
      'Only tickets with status `active` can be regenerated. Tickets in `used` or `cancelled` ' +
      'status are rejected with 422.\n\n' +
      'If the ticket already had QR files on disk, they are deleted before re-enqueuing to ' +
      'prevent accumulation of orphaned files.'
  })
  @ApiParam({ name: 'ticketId', description: 'Ticket UUID.', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({ status: 202, description: 'QR regeneration enqueued. The new QR will be available shortly.' })
  @ApiResponse({ status: 401, description: 'JWT token missing, invalid or expired.' })
  @ApiResponse({ status: 403, description: 'Authenticated user does not have the Administrador role.' })
  @ApiResponse({ status: 404, description: 'Ticket not found.' })
  @ApiResponse({ status: 422, description: 'Ticket is not in `active` status — only active tickets can have their QR regenerated.' })
  @HttpCode(202)
  @Post(':ticketId/regenerate-qr')
  async regenerateQr(@Param('ticketId') ticketId: string): Promise<{ message: string; ticketId: string }> {
    const ticket = await this.dataSource.getRepository(TicketEntity).findOne({
      where: { uuid: ticketId },
      relations: { orderItem: true }
    });

    if (!ticket) throw new NotFoundException('Ticket not found');

    if (ticket.status !== TicketStatus.ACTIVE) {
      throw new UnprocessableEntityException(
        `Cannot regenerate QR for a ticket with status "${ticket.status}". Only active tickets are eligible.`
      );
    }

    // Clear existing files if present
    if (ticket.qrCode !== null) {
      const qrPath = this.storageService.resolveAbsolutePath('tickets/qr', `${ticketId}.png`);
      const pdfPath = this.storageService.resolveAbsolutePath('tickets/pdf', `${ticketId}.pdf`);

      await Promise.allSettled([this.storageService.deleteFile(qrPath), this.storageService.deleteFile(pdfPath)]);

      await this.dataSource.getRepository(TicketEntity).update({ uuid: ticketId }, { qrCode: null, qrUrl: null, pdfUrl: null });

      this.logger.log(`Cleared existing QR assets for ticket ${ticketId}`);
    }

    const jobData: GenerateQrJobData = {
      ticketId: ticket.uuid,
      orderId: ticket.orderItem.orderUuid,
      eventId: ticket.eventUuid,
      userId: ticket.userUuid,
      ticketTypeId: ticket.ticketTypeUuid
    };
    await this.ticketsQueue.add('generate-qr', jobData);

    this.logger.log(`Regenerate-QR enqueued for ticket ${ticketId}`);

    return { message: 'QR en proceso de regeneración', ticketId };
  }
}
