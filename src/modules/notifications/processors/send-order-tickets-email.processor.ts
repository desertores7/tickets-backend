import { shortUnitLabel } from '@modules/orders/services/core/sector-unit-sale';
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
import { pickEventCover, resolveEventCoverPaths } from '@root/shared/services/event-cover';
import { NotificationEmailService, EmailAttachment } from '../services/implementation/notification-email.service';

import { resolvePublicSiteUrl } from '@root/shared/auth/const/email-brand';

/** Ventana del candado anti-duplicado: sobra para que lleguen los dos caminos. */
const ORDER_EMAIL_IDEMPOTENCY_TTL = 24 * 60 * 60;

/** Tipos de pago de Mercado Pago (`payment_type_id`). Mismo mapeo que el frontend. */
const PAYMENT_TYPE_LABEL: Record<string, string> = {
  credit_card: 'Tarjeta de crédito',
  debit_card: 'Tarjeta de débito',
  prepaid_card: 'Tarjeta prepaga',
  account_money: 'Dinero en cuenta',
  ticket: 'Pago en efectivo',
  bank_transfer: 'Transferencia',
  atm: 'Cajero',
  digital_currency: 'Moneda digital'
};

/** Marcas / métodos concretos (`payment_method_id`). */
const PAYMENT_BRAND_LABEL: Record<string, string> = {
  visa: 'Visa',
  master: 'Mastercard',
  amex: 'American Express',
  naranja: 'Naranja',
  cabal: 'Cabal',
  debvisa: 'Visa Débito',
  debmaster: 'Mastercard Débito'
};

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
    // Portada del email: el banner del evento y, si no tiene, su flyer.
    const covers = await resolveEventCoverPaths(this.dataSource, [order.event.uuid]);

    const eventDate = new Intl.DateTimeFormat('es-AR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(order.event.startDate);

    // Pago: el medio y los últimos 4 dígitos salen de la respuesta de Mercado Pago.
    const payment = (await this.dataSource
      .getRepository('payment')
      .findOne({ where: { orderUuid: order.uuid } })) as {
      paymentMethod?: string | null;
      paymentType?: string | null;
      installments?: number | null;
      rawResponse?: Record<string, any> | null;
    } | null;
    const money = (value: number) =>
      new Intl.NumberFormat('es-AR', { style: 'currency', currency: order.currency || 'ARS' }).format(value);
    const card = payment?.rawResponse?.card as { last_four_digits?: string } | undefined;
    // `paymentType` = payment_type_id de MP (credit_card, account_money, ticket…),
    // `paymentMethod` = payment_method_id (visa, master, account_money…). Antes se
    // mostraba el código crudo de MP capitalizado ("Account_money"); acá se
    // traduce con el mismo mapeo que ya usa el frontend
    // (tickets-frontend/src/lib/payments/payment-method-labels.ts).
    const paymentTypeCode = (payment?.paymentType ?? '').toString().trim();
    const paymentMethodCode = (payment?.paymentMethod ?? order.paymentMethod ?? '').toString().trim();
    const typeLabel = PAYMENT_TYPE_LABEL[paymentTypeCode];
    const brandLabel = PAYMENT_BRAND_LABEL[paymentMethodCode];
    const paymentLabel = card?.last_four_digits
      ? `${brandLabel ?? typeLabel ?? 'Tarjeta'} terminada en ${card.last_four_digits}`
      : typeLabel ??
        brandLabel ??
        (paymentMethodCode ? paymentMethodCode.charAt(0).toUpperCase() + paymentMethodCode.slice(1) : 'Pago online');
    const installments = Number(payment?.installments ?? 1);
    const paidAt = order.paidAt
      ? new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(order.paidAt)
      : null;
    const discount = Number(order.discountAmount ?? 0);

    const summary = {
      lines: order.items.map(item => {
        const unit = shortUnitLabel(item.unitLabel);
        const tierName = (item.ticketType?.name ?? 'Entrada').replace(/\s*\d+\s*$/, '').trim() || 'Entrada';
        const admissions = Math.max(1, Number(item.admissionsPerUnit ?? 1)) * item.quantity;
        return {
          name: unit || item.ticketType?.name || 'Entrada',
          detail: `${unit ? `${tierName} · ` : ''}${admissions} ${admissions === 1 ? 'entrada' : 'entradas'}`,
          amount: money(Number(item.unitPrice) * item.quantity)
        };
      }),
      subtotal: money(Number(order.subtotal)),
      hasDiscount: discount > 0,
      discount: money(discount),
      serviceFee: money(Number(order.serviceFee)),
      total: money(Number(order.total)),
      paymentLabel,
      // En 1 pago no aporta nada mostrar "Cuotas: 1 pago" — el template
      // solo muestra la fila cuando esto tiene valor.
      installmentsLabel: installments > 1 ? `${installments} cuotas` : null,
      paidAt
    };

    const templateData = {
      summary,
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
        ticketTypeName: `${shortUnitLabel(t.unitLabel) || t.ticketType?.name || 'Entrada'} · 1 Entrada`
      })),
      ticketsUrl: `${resolvePublicSiteUrl(this.envService.get('FRONTEND_URL'))}/client/tickets`,
      // Portada: el banner del evento si lo hay. El template la trata como
      // opcional, así que un evento sin banner manda el email igual.
      // `toPublicUrl` antepone el host: en la base el banner se guarda relativo
      // (`/static/events/banners/…`), y un `src` relativo en un email no
      // resuelve contra nada — se ve como imagen rota.
      heroUrl: this.storageService.toPublicUrl(pickEventCover(order.event, covers)),
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
