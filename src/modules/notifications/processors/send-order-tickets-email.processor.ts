import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DataSource, In } from 'typeorm';
import {
  QUEUE_NAMES,
  SendOrderTicketsEmailJobData,
  SendTransferOfferEmailJobData
} from '@config/redis/bull-jobs.types';
import { TicketTransferEntity } from '@config/db/entities/tickets/ticket_transfer.entity';
import { EnvService } from '@config/env/env.service';
import { OrderEntity, OrderStatus } from '@config/db/entities/tickets/order.entity';
import { TicketEntity } from '@config/db/entities/tickets/ticket.entity';
import { StorageService } from '@root/shared/services/storage.service';
import { NotificationEmailService, EmailAttachment } from '../services/implementation/notification-email.service';

@Processor(QUEUE_NAMES.NOTIFICATIONS)
export class SendOrderTicketsEmailProcessor extends WorkerHost {
  private readonly logger = new Logger(SendOrderTicketsEmailProcessor.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly storageService: StorageService,
    private readonly notificationEmailService: NotificationEmailService,
    private readonly envService: EnvService
  ) {
    super();
  }

  // Una queue = un worker: este processor atiende todos los jobs de `notifications`
  async process(job: Job): Promise<void> {
    if (job.name === 'send-transfer-offer') {
      return this.handleTransferOffer(job.data as SendTransferOfferEmailJobData);
    }
    if (job.name === 'send-order-tickets-email') {
      return this.handleOrderTickets(job.data as SendOrderTicketsEmailJobData);
    }
  }

  /**
   * Invitación a aceptar una transferencia. NO adjunta el PDF: la entrada recién
   * cambia de dueño cuando el destinatario confirma desde su cuenta.
   */
  private async handleTransferOffer(data: SendTransferOfferEmailJobData): Promise<void> {
    const transfer = await this.dataSource.getRepository(TicketTransferEntity).findOne({
      where: { uuid: data.transferId },
      relations: { ticket: { event: true, ticketType: true } }
    });

    if (!transfer) {
      this.logger.error(`Transfer not found: ${data.transferId} — skipping email (no retry)`);
      return;
    }

    const event = transfer.ticket.event;
    const eventDate = new Intl.DateTimeFormat('es-AR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(event.startDate);

    const frontendUrl = (this.envService.get('FRONTEND_URL') ?? '').replace(/\/$/, '');
    // Con cuenta va directo a sus transferencias; sin cuenta, al registro y de
    // ahí vuelve al mismo lugar.
    const actionUrl = data.recipientHasAccount
      ? `${frontendUrl}/my-tickets?tab=transfers`
      : `${frontendUrl}/register?redirect=${encodeURIComponent('/my-tickets?tab=transfers')}`;

    await this.notificationEmailService.sendTransferOfferEmail({
      to: data.toEmail,
      subject: `🎁 ${data.fromName} quiere transferirte una entrada para ${event.name}`,
      templateData: {
        preheader: `${data.fromName} te transfiere una entrada para ${event.name}. Aceptala para que sea tuya.`,
        fromName: data.fromName,
        message: data.message ?? '',
        eventName: event.name,
        eventDate,
        venueName: event.venueName,
        venueCity: event.venueCity,
        ticketTypeName: transfer.ticket.ticketType?.name ?? 'Entrada',
        recipientHasAccount: data.recipientHasAccount,
        actionUrl,
        actionText: data.recipientHasAccount ? 'Ver la transferencia' : 'Crear mi cuenta',
        appName: 'Ticketera',
        year: new Date().getFullYear()
      },
      attachments: []
    });

    this.logger.log(`Transfer offer email sent: transfer=${transfer.uuid} to=${data.toEmail}`);
  }

  private async handleOrderTickets(jobData: SendOrderTicketsEmailJobData): Promise<void> {
    const { orderId } = jobData;

    // 1. Cargar la orden con usuario, evento e items
    const order = await this.dataSource.getRepository(OrderEntity).findOne({
      where: { uuid: orderId },
      relations: { user: true, event: true, items: { ticketType: true } }
    });

    if (!order) {
      this.logger.error(`Order not found: ${orderId} — skipping email (no retry)`);
      return;
    }

    if (order.status !== OrderStatus.PAID) {
      this.logger.warn(`Order ${order.orderNumber} is not paid (${order.status}) — skipping email`);
      return;
    }

    // 2. Cargar todos los tickets de la orden
    const itemUuids = order.items.map(item => item.uuid);
    const tickets = await this.dataSource.getRepository(TicketEntity).find({
      where: { orderItemUuid: In(itemUuids) },
      relations: { ticketType: true }
    });

    if (tickets.length === 0) {
      this.logger.error(`Order ${order.orderNumber} has no tickets — skipping email (no retry)`);
      return;
    }

    // 3. Verificar que TODOS los PDFs ya fueron generados (los genera generate-qr
    //    de forma asíncrona). Si falta alguno, lanzar para que BullMQ reintente
    //    con backoff — el email sale solo cuando la orden está completa.
    const pending = tickets.filter(t => t.pdfUrl === null);
    if (pending.length > 0) {
      throw new Error(
        `Order ${order.orderNumber}: ${pending.length}/${tickets.length} ticket PDFs not ready yet — retrying later`
      );
    }

    // 4. Armar adjuntos desde el storage local
    const attachments: EmailAttachment[] = tickets.map(t => ({
      filename: `${t.ticketNumber}.pdf`,
      path: this.storageService.resolveAbsolutePath('tickets/pdf', `${t.uuid}.pdf`)
    }));

    // 5. Datos del template
    const eventDate = new Intl.DateTimeFormat('es-AR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(order.event.startDate);

    const templateData = {
      preheader: `Tus entradas para ${order.event.name} están adjuntas en este correo.`,
      firstName: order.user.firstName,
      eventName: order.event.name,
      eventDate,
      venueName: order.event.venueName,
      venueCity: order.event.venueCity,
      orderNumber: order.orderNumber,
      ticketCount: tickets.length,
      tickets: tickets.map(t => ({
        ticketNumber: t.ticketNumber,
        ticketTypeName: t.ticketType?.name ?? 'Entrada'
      })),
      appName: 'Ticketera',
      year: new Date().getFullYear()
    };

    // 6. Enviar UN email con todos los PDFs de la orden
    await this.notificationEmailService.sendOrderTicketsEmail({
      to: order.user.email,
      subject: `🎫 Tus entradas para ${order.event.name}`,
      templateData,
      attachments
    });

    this.logger.log(
      `Tickets email sent: order=${order.orderNumber} to=${order.user.email} tickets=${tickets.length}`
    );
  }
}
