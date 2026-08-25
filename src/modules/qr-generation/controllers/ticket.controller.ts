import {
  Body,
  Controller,
  Delete,
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
import { DataSource, In, IsNull } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { AdminAuth } from '@root/shared/auth/decorator/admin-auth.decorator';
import { UserAuth } from '@root/shared/auth/decorator/user-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import { ApiPagination, IPaginationParams, PaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { StorageService } from '@root/shared/services/storage.service';
import {
  QUEUE_NAMES,
  GenerateQrJobData,
  SendTransferOfferEmailJobData
} from '@config/redis/bull-jobs.types';
import {
  TicketTransferEntity,
  TicketTransferStatus
} from '@config/db/entities/tickets/ticket_transfer.entity';
import { UserEntity } from '@config/db/entities/user/user.entity';
import { TransferTicketRequest } from './dtos/transfer-ticket/transfer-ticket.request';
import { PendingTransferResponse } from './dtos/pending-transfer/pending-transfer.response';
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

  constructor(
    private readonly dataSource: DataSource,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.TICKETS) private readonly ticketsQueue: Queue
  ) {}

  // ---------------------------------------------------------------------------
  // POST /api/v1/tickets/:ticketId/transfer
  // ---------------------------------------------------------------------------

  @UserAuth(TransferTicketRequest, null)
  @ApiOperation({
    summary: 'Offer a ticket transfer by email',
    description:
      'Creates a **pending** transfer to the given email and notifies the recipient.\n\n' +
      'Nothing changes hands until the recipient accepts: the ticket stays `active` and owned by ' +
      'the sender, who can cancel the offer meanwhile. The recipient needs an account with that ' +
      'email to accept — if they do not have one, the email invites them to register.\n\n' +
      'On acceptance the ticket changes owner and its QR is regenerated, so the sender copy stops working.'
  })
  @ApiParam({ name: 'ticketId', description: 'Ticket UUID.' })
  @ApiResponse({ status: 200, description: 'Transfer offered; the email is sent asynchronously.' })
  @ApiResponse({ status: 400, description: 'Invalid email.' })
  @ApiResponse({ status: 403, description: 'Ticket does not belong to the authenticated user.' })
  @ApiResponse({ status: 404, description: 'Ticket not found.' })
  @ApiResponse({
    status: 422,
    description: 'Ticket is not active, the event finished, there is already a pending transfer, or you sent it to yourself.'
  })
  @HttpCode(200)
  @Post(':ticketId/transfer')
  async transferTicket(
    @Param('ticketId') ticketId: string,
    @Body() body: TransferTicketRequest,
    @User() userId: string
  ): Promise<{ transferId: string; toEmail: string; recipientHasAccount: boolean }> {
    const ticket = await this.dataSource.getRepository(TicketEntity).findOne({
      where: { uuid: ticketId },
      relations: { event: true, user: true }
    });

    if (!ticket) throw new NotFoundException('Entrada no encontrada');
    if (ticket.userUuid !== userId) throw new ForbiddenException('Esta entrada no es tuya');

    if (ticket.status !== TicketStatus.ACTIVE) {
      throw new UnprocessableEntityException(
        ticket.status === TicketStatus.USED
          ? 'Esta entrada ya fue utilizada'
          : 'Solo se pueden transferir entradas activas'
      );
    }

    if (new Date(ticket.event.endDate) < new Date()) {
      throw new UnprocessableEntityException('El evento ya finalizó');
    }

    const email = body.email.trim().toLowerCase();

    if (email === ticket.user.email?.toLowerCase()) {
      throw new UnprocessableEntityException('No podés transferirte la entrada a vos mismo');
    }

    const transferRepo = this.dataSource.getRepository(TicketTransferEntity);

    const pending = await transferRepo.findOne({
      where: { ticketUuid: ticket.uuid, status: TicketTransferStatus.PENDING }
    });
    if (pending) {
      throw new UnprocessableEntityException(
        `Esta entrada ya tiene una transferencia pendiente a ${pending.toEmail}. Cancelala antes de enviar otra.`
      );
    }

    const transfer = transferRepo.create({
      uuid: uuidv4(),
      ticketUuid: ticket.uuid,
      fromUserUuid: userId,
      toEmail: email,
      status: TicketTransferStatus.PENDING,
      message: body.message ?? null
    });
    await transferRepo.save(transfer);

    // Si ya tiene cuenta, el mail lo manda a aceptar; si no, a registrarse primero
    const recipient = await this.dataSource
      .getRepository(UserEntity)
      .findOne({ where: { email, isDeleted: IsNull() } });

    const jobData: SendTransferOfferEmailJobData = {
      transferId: transfer.uuid,
      toEmail: email,
      fromName: `${ticket.user.firstName} ${ticket.user.lastName}`.trim(),
      recipientHasAccount: !!recipient,
      message: body.message
    };
    await this.notificationsQueue.add('send-transfer-offer', jobData, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 }
    });

    this.logger.log(`Transferencia ofrecida: ticket=${ticket.ticketNumber} a=${email} (cuenta=${!!recipient})`);

    return { transferId: transfer.uuid, toEmail: email, recipientHasAccount: !!recipient };
  }

  // ---------------------------------------------------------------------------
  // GET /api/v1/tickets/transfers/pending
  // ---------------------------------------------------------------------------

  @UserAuth(null, null)
  @ApiOperation({
    summary: 'Transfers waiting for my confirmation',
    description: 'Pending transfers addressed to the email of the authenticated user.'
  })
  @ApiResponse({ status: 200, description: 'Pending transfers.' })
  @HttpCode(200)
  @Get('transfers/pending')
  async getPendingTransfers(@User() userId: string): Promise<PendingTransferResponse[]> {
    const me = await this.dataSource.getRepository(UserEntity).findOne({ where: { uuid: userId } });
    if (!me) throw new NotFoundException('Usuario no encontrado');

    const transfers = await this.dataSource.getRepository(TicketTransferEntity).find({
      where: { toEmail: me.email.toLowerCase(), status: TicketTransferStatus.PENDING },
      relations: { ticket: { event: true, ticketType: true }, fromUser: true },
      order: { createdAt: 'DESC' }
    });

    // Una transferencia de un evento que ya terminó no tiene sentido aceptarla
    const now = new Date();
    return transfers
      .filter(t => new Date(t.ticket.event.endDate) >= now)
      .map(t => new PendingTransferResponse(t));
  }

  // ---------------------------------------------------------------------------
  // POST /api/v1/tickets/transfers/:transferId/accept
  // ---------------------------------------------------------------------------

  @UserAuth(null, null)
  @ApiOperation({
    summary: 'Accept a ticket transfer',
    description:
      'Moves ticket ownership to the authenticated user and regenerates the QR, so the previous ' +
      'holder copy stops being valid.\n\n' +
      'Requirements: the account email must match the offer **and** be verified — accepting a ' +
      'ticket is proof that the address belongs to the recipient.'
  })
  @ApiParam({ name: 'transferId', description: 'Transfer UUID.' })
  @ApiResponse({ status: 200, description: 'Transfer accepted; the ticket is now yours.' })
  @ApiResponse({ status: 403, description: 'The transfer was not addressed to your email.' })
  @ApiResponse({ status: 404, description: 'Transfer not found.' })
  @ApiResponse({ status: 422, description: 'Email not verified, transfer already resolved, or the event finished.' })
  @HttpCode(200)
  @Post('transfers/:transferId/accept')
  async acceptTransfer(
    @Param('transferId') transferId: string,
    @User() userId: string
  ): Promise<{ ticketId: string }> {
    const { transfer, me } = await this.loadTransferForRecipient(transferId, userId);

    // Recibir una entrada exige haber probado que el email es tuyo: es la única
    // garantía de que la transferencia llegó a la persona correcta.
    if (!me.emailVerified) {
      throw new UnprocessableEntityException(
        'Tenés que validar tu correo antes de aceptar una entrada. Revisá tu bandeja de entrada.'
      );
    }

    if (new Date(transfer.ticket.event.endDate) < new Date()) {
      throw new UnprocessableEntityException('El evento ya finalizó');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager.update(
        TicketTransferEntity,
        { uuid: transfer.uuid },
        { status: TicketTransferStatus.ACCEPTED, toUserUuid: userId, respondedAt: new Date() }
      );

      // Cambio de titularidad + limpieza del QR: el job lo regenera con un token
      // nuevo, invalidando la copia del remitente.
      await queryRunner.manager.update(
        TicketEntity,
        { uuid: transfer.ticketUuid },
        { userUuid: userId, qrCode: null, qrUrl: null, pdfUrl: null }
      );

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error('acceptTransfer transaction failed', err);
      throw err;
    } finally {
      await queryRunner.release();
    }

    const jobData: GenerateQrJobData = {
      ticketId: transfer.ticketUuid,
      orderId: transfer.ticket.orderItemUuid,
      userId,
      eventId: transfer.ticket.eventUuid,
      ticketTypeId: transfer.ticket.ticketTypeUuid
    };
    await this.ticketsQueue.add('generate-qr', jobData);

    this.logger.log(`Transferencia aceptada: ticket=${transfer.ticket.ticketNumber} nuevo dueño=${me.email}`);

    return { ticketId: transfer.ticketUuid };
  }

  // ---------------------------------------------------------------------------
  // POST /api/v1/tickets/transfers/:transferId/reject
  // ---------------------------------------------------------------------------

  @UserAuth(null, null)
  @ApiOperation({ summary: 'Reject a ticket transfer', description: 'The ticket stays with the sender.' })
  @ApiParam({ name: 'transferId', description: 'Transfer UUID.' })
  @ApiResponse({ status: 200, description: 'Transfer rejected.' })
  @HttpCode(200)
  @Post('transfers/:transferId/reject')
  async rejectTransfer(@Param('transferId') transferId: string, @User() userId: string): Promise<void> {
    const { transfer } = await this.loadTransferForRecipient(transferId, userId);
    await this.dataSource
      .getRepository(TicketTransferEntity)
      .update({ uuid: transfer.uuid }, { status: TicketTransferStatus.REJECTED, respondedAt: new Date() });
  }

  // ---------------------------------------------------------------------------
  // DELETE /api/v1/tickets/transfers/:transferId
  // ---------------------------------------------------------------------------

  @UserAuth(null, null)
  @ApiOperation({
    summary: 'Cancel a transfer I offered',
    description: 'Only while it is still pending. Lets the sender fix a typo in the email.'
  })
  @ApiParam({ name: 'transferId', description: 'Transfer UUID.' })
  @ApiResponse({ status: 200, description: 'Transfer cancelled.' })
  @HttpCode(200)
  @Delete('transfers/:transferId')
  async cancelTransfer(@Param('transferId') transferId: string, @User() userId: string): Promise<void> {
    const transfer = await this.dataSource
      .getRepository(TicketTransferEntity)
      .findOne({ where: { uuid: transferId } });

    if (!transfer) throw new NotFoundException('Transferencia no encontrada');
    if (transfer.fromUserUuid !== userId) throw new ForbiddenException('Esta transferencia no es tuya');
    if (transfer.status !== TicketTransferStatus.PENDING) {
      throw new UnprocessableEntityException('Solo se pueden cancelar transferencias pendientes');
    }

    await this.dataSource
      .getRepository(TicketTransferEntity)
      .update({ uuid: transfer.uuid }, { status: TicketTransferStatus.CANCELLED, respondedAt: new Date() });
  }

  /** Carga la transferencia validando que el usuario autenticado sea el destinatario */
  private async loadTransferForRecipient(transferId: string, userId: string) {
    const me = await this.dataSource.getRepository(UserEntity).findOne({ where: { uuid: userId } });
    if (!me) throw new NotFoundException('Usuario no encontrado');

    const transfer = await this.dataSource.getRepository(TicketTransferEntity).findOne({
      where: { uuid: transferId },
      relations: { ticket: { event: true } }
    });

    if (!transfer) throw new NotFoundException('Transferencia no encontrada');

    if (transfer.toEmail !== me.email.toLowerCase()) {
      throw new ForbiddenException('Esta transferencia no fue enviada a tu email');
    }

    if (transfer.status !== TicketTransferStatus.PENDING) {
      throw new UnprocessableEntityException('Esta transferencia ya fue resuelta');
    }

    return { transfer, me };
  }

  // ---------------------------------------------------------------------------
  // GET /api/v1/tickets/me
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
  @Get('me')
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

    // Transferencias pendientes de estos tickets, para marcarlas en la lista
    const pendingTransfers = tickets.length
      ? await this.dataSource.getRepository(TicketTransferEntity).find({
          where: { ticketUuid: In(tickets.map(t => t.uuid)), status: TicketTransferStatus.PENDING }
        })
      : [];
    const pendingByTicket = new Map(pendingTransfers.map(p => [p.ticketUuid, p]));

    const items = tickets.map(t => {
      const pending = pendingByTicket.get(t.uuid);
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
        pendingTransfer: pending ? { id: pending.uuid, toEmail: pending.toEmail } : null,
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
