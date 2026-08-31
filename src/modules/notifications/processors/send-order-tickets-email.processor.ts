import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DataSource, In } from 'typeorm';
import {
  QUEUE_NAMES,
  SendOrderTicketsEmailJobData,
} from '@config/redis/bull-jobs.types';
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
    if (job.name === 'send-order-tickets-email') {
      return this.handleOrderTickets(job.data as SendOrderTicketsEmailJobData);
    }
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
