import { Controller, ForbiddenException, Get, HttpCode, Logger, NotFoundException, Param, Post, UnprocessableEntityException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Queue } from 'bullmq';
import { In } from 'typeorm';
import { DataSource } from 'typeorm';
import { AdminAuth } from '@root/shared/auth/decorator/admin-auth.decorator';
import { UserAuth } from '@root/shared/auth/decorator/user-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import { ApiPagination, IPaginationParams, PaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { StorageService } from '@root/shared/services/storage.service';
import { QUEUE_NAMES, GenerateQrJobData } from '@config/redis/bull-jobs.types';
import { TicketEntity, TicketStatus } from '@config/db/entities/tickets/ticket.entity';
import {
  GetTicketData,
  GetTicketEventData,
  GetTicketOrderData,
  GetTicketResponse,
  GetTicketTypeData
} from './dtos/get-ticket/get-ticket.response';
import { GetMyTicketsResponse, TicketSummaryData, TicketSummaryResponse } from './dtos/get-my-tickets/get-my-tickets.response';

// ── User-facing ticket endpoints ─────────────────────────────────────────────

@ApiTags('Tickets')
@Controller({ path: 'tickets', version: '1' })
export class TicketController {
  private readonly logger = new Logger(TicketController.name);

  constructor(private readonly dataSource: DataSource) {}

  // ---------------------------------------------------------------------------
  // GET /api/v1/tickets/mine
  // ---------------------------------------------------------------------------

  @UserAuth(null, GetMyTicketsResponse)
  @ApiOperation({
    summary: 'List my tickets',
    description:
      'Returns a paginated list of all active and used tickets belonging to the authenticated user, ' +
      'sorted by creation date descending. Cancelled tickets are excluded.'
  })
  @ApiResponse({ status: 200, type: GetMyTicketsResponse, description: 'Paginated list of tickets.' })
  @ApiResponse({ status: 401, description: 'JWT token missing, invalid or expired.' })
  @ApiPagination()
  @HttpCode(200)
  @Get('mine')
  async getMyTickets(@PaginationParams() pagination: IPaginationParams, @User() userId: string): Promise<GetMyTicketsResponse> {
    const { page, limit } = pagination;

    const [tickets, total] = await this.dataSource.getRepository(TicketEntity).findAndCount({
      where: {
        userUuid: userId,
        status: In([TicketStatus.ACTIVE, TicketStatus.USED])
      },
      relations: { orderItem: { order: true }, event: true, ticketType: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit
    });

    const items = tickets.map(t => {
      const data: TicketSummaryData = {
        uuid: t.uuid,
        ticketNumber: t.ticketNumber,
        status: t.status,
        qrUrl: t.qrUrl,
        pdfUrl: t.pdfUrl,
        eventName: t.event.name,
        eventDate: t.event.startDate,
        venueName: t.event.venueName,
        ticketTypeName: t.ticketType.name,
        createdAt: t.createdAt
      };
      return new TicketSummaryResponse(data);
    });

    const meta = new PaginationMetaResponse({ total, page, limit });
    return new GetMyTicketsResponse(items, meta);
  }

  // ---------------------------------------------------------------------------
  // GET /api/v1/tickets/:ticketId
  // ---------------------------------------------------------------------------

  @UserAuth(null, GetTicketResponse)
  @ApiOperation({
    summary: 'Get ticket detail',
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
      relations: { orderItem: { order: true }, event: true, ticketType: true, user: true }
    });

    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.userUuid !== userId) throw new ForbiddenException('Access denied');

    const event: GetTicketEventData = {
      uuid: ticket.event.uuid,
      name: ticket.event.name,
      startDate: ticket.event.startDate,
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

    const data: GetTicketData = {
      uuid: ticket.uuid,
      ticketNumber: ticket.ticketNumber,
      status: ticket.status,
      qrUrl: ticket.qrUrl,
      pdfUrl: ticket.pdfUrl,
      qrCode: ticket.qrCode,
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
@Controller({ path: 'admin/tickets', version: '1' })
export class AdminTicketController {
  private readonly logger = new Logger(AdminTicketController.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly storageService: StorageService,
    @InjectQueue(QUEUE_NAMES.TICKETS) private readonly ticketsQueue: Queue
  ) {}

  // ---------------------------------------------------------------------------
  // POST /api/v1/admin/tickets/:ticketId/regenerate-qr
  // ---------------------------------------------------------------------------

  @AdminAuth(null, null)
  @ApiOperation({
    summary: 'Regenerate ticket QR (admin)',
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
