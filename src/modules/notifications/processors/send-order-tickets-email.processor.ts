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
import { RedisService } from '@config/redis/redis.service';
import { StorageService } from '@root/shared/services/storage.service';
import { NotificationEmailService, EmailAttachment } from '../services/implementation/notification-email.service';

/** Ventana del candado anti-duplicado: sobra para que lleguen los dos caminos. */
const ORDER_EMAIL_IDEMPOTENCY_TTL = 24 * 60 * 60;

@Processor(QUEUE_NAMES.NOTIFICATIONS)
export class SendOrderTicketsEmailProcessor extends WorkerHost {
  private readonly logger = new Logger(SendOrderTicketsEmailProcessor.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly storageService: StorageService,
    private readonly notificationEmailService: NotificationEmailService,
    private readonly envService: EnvService,
    private readonly redisService: RedisService
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
      ticketsUrl: `${(this.envService.get('FRONTEND_URL') || '').replace(/\/$/, '')}/client/tickets`,
      // Portada: el banner del evento si lo hay. El template la trata como
      // opcional, así que un evento sin banner manda el email igual.
      // `toPublicUrl` antepone el host: en la base el banner se guarda relativo
      // (`/static/events/banners/…`), y un `src` relativo en un email no
      // resuelve contra nada — se ve como imagen rota.
      heroUrl: this.storageService.toPublicUrl(
        order.event.bannerUrl ?? order.event.bannerImages?.desktop ?? null
      ),
      heroAlt: order.event.name,
      heroKicker: order.event.name
    };

    // 6. Un solo email por orden, pase lo que pase.
    //
    // Hay dos caminos que lo encolan: el job con delay de `confirmPayment` y el
    // disparo por evento de `generate-qr` cuando termina la última entrada. Es
    // a propósito —el primero se agota a los ~5 minutos y no siempre alcanza—,
    // pero cuando los dos llegan, el segundo tiene que caerse acá y no mandar
    // las entradas dos veces.
    const primero = await this.redisService.markIdempotency(
      `order-tickets-email:${order.uuid}`,
      ORDER_EMAIL_IDEMPOTENCY_TTL
    );
    if (!primero) {
      this.logger.log(`Email de la orden ${order.orderNumber} ya enviado — se descarta el duplicado`);
      return;
    }

    try {
      await this.notificationEmailService.sendOrderTicketsEmail({
        to: order.user.email,
        subject: `🎫 Tus entradas para ${order.event.name}`,
        templateData,
        attachments
      });
    } catch (error) {
      // Se loguea acá y no solo se relanza: sin esto el motivo queda enterrado
      // en el `failedReason` del job en Redis y no aparece en `docker logs`.
      // Un certificado SMTP vencido tardó horas en encontrarse por eso.
      this.logger.error(
        `No se pudo enviar el email de la orden ${order.orderNumber}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );

      // Se libera el candado antes de relanzar. Si queda puesto, el reintento
      // se descarta como duplicado y el email no sale nunca.
      await this.redisService.deleteKey(`order-tickets-email:${order.uuid}`);
      throw error;
    }

    this.logger.log(
      `Tickets email sent: order=${order.orderNumber} to=${order.user.email} tickets=${tickets.length}`
    );
  }
}
