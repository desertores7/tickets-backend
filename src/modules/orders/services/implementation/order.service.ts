import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DBRepository } from '@config/db/db.repository';
import { RedisService } from '@config/redis/redis.service';
import {
  GenerateQrJobData,
  QUEUE_NAMES,
  ReleaseExpiredStockJobData,
  SendOrderTicketsEmailJobData
} from '@config/redis/bull-jobs.types';
import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { StockService } from './stock.service';
import { FeeSummaryService } from './fee-summary.service';
import { IOrderService, PaginatedResult } from '../contracts/iorder.service';
import {
  ICreateOrder,
  IOrderItem,
  IOrderTicket,
  Order,
  OrderStatus,
  PaymentConfirmationData,
  TicketStatus
} from '../core/order';
import { IUserNotificationService } from '@modules/notifications/services/contracts/iuser-notification.service';
import { IStockAlertService } from '@modules/stock-alerts/services/contracts/istock-alert.service';
import { ICouponService } from '@modules/coupons/services/contracts/icoupon.service';

const ORDER_EXPIRY_MS = 10 * 60 * 1000;
/** Costo de servicio ticketera — 15% sobre subtotal (post-cupón). Ver BR-PAY-002. */
/** BR-SALE-006: tope de entradas por transacción */
const MAX_TICKETS_PER_ORDER = 20;

const SERVICE_FEE_RATE = 0.15;
const IDEMPOTENCY_TTL_SECONDS = 86400;

@Injectable()
export class OrderService implements IOrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @Inject(DBRepository) private readonly dbRepository: DBRepository,
    private readonly stockService: StockService,
    private readonly feeSummaryService: FeeSummaryService,
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource,
    @InjectQueue(QUEUE_NAMES.ORDERS) private readonly ordersQueue: Queue,
    @InjectQueue(QUEUE_NAMES.TICKETS) private readonly ticketsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationsQueue: Queue,
    @Inject('IUserNotificationService')
    private readonly userNotificationService: IUserNotificationService,
    @Inject('IStockAlertService')
    private readonly stockAlertService: IStockAlertService,
    @Inject('ICouponService')
    private readonly couponService: ICouponService
  ) {}

  // ---------------------------------------------------------------------------
  // Public methods
  // ---------------------------------------------------------------------------

  async createOrder(userId: string, dto: ICreateOrder): Promise<Order> {
    // Reglas sobre el comprador y el carrito, antes de tocar evento o stock.
    // Se valida en el backend y no solo en el front: el tope por tipo del DTO
    // (10) por 5 tipos permitiría 50 entradas en una sola llamada directa.
    const totalTickets = dto.items.reduce((sum, item) => sum + item.quantity, 0);
    if (totalTickets > MAX_TICKETS_PER_ORDER) {
      throw new UnprocessableEntityException(
        `No se pueden comprar más de ${MAX_TICKETS_PER_ORDER} entradas en una misma operación`
      );
    }

    await this.assertBuyerCanPurchase(userId);

    // 1. Validate event
    const event = await this.dbRepository.findOne({
      entity: 'event',
      where: { uuid: dto.eventUuid }
    });

    if (!event) {
      throw new NotFoundException('Evento no encontrado');
    }

    if (!event.isPublished || !event.isActive) {
      throw new UnprocessableEntityException('El evento no está disponible para la venta');
    }

    const now = new Date();

    if (event.saleStartDate && now < event.saleStartDate) {
      throw new UnprocessableEntityException('El período de venta aún no ha comenzado');
    }

    // Sin saleEndDate definido, la venta sigue abierta hasta que termina el evento.
    // Si el organizador fijó un cierre anticipado, ese manda.
    const eventEnd = new Date(event.endDate);
    const saleEnd = event.saleEndDate ? new Date(event.saleEndDate) : eventEnd;

    if (now > saleEnd) {
      throw new UnprocessableEntityException(
        now > eventEnd ? 'El evento ya finalizó' : 'El período de venta ha finalizado'
      );
    }

    // 2. Validate each ticket type
    const ticketTypes = await Promise.all(
      dto.items.map(item =>
        this.dbRepository.findOne({
          entity: 'ticket_type',
          where: { uuid: item.ticketTypeUuid }
        })
      )
    );

    for (let i = 0; i < dto.items.length; i++) {
      const item = dto.items[i];
      const ticketType = ticketTypes[i];

      if (!ticketType || ticketType.eventUuid !== dto.eventUuid) {
        throw new NotFoundException(
          `Tipo de entrada no encontrado: ${item.ticketTypeUuid}`
        );
      }

      if (!ticketType.isActive) {
        throw new UnprocessableEntityException(
          `El tipo de entrada "${ticketType.name}" no está disponible`
        );
      }

      // Validar ventana de venta de la tanda (saleStartDate / saleEndDate)
      if (ticketType.saleStartDate && now < new Date(ticketType.saleStartDate)) {
        throw new UnprocessableEntityException(
          `La tanda "${ticketType.name}" aún no está en venta`
        );
      }
      if (ticketType.saleEndDate && now > new Date(ticketType.saleEndDate)) {
        throw new UnprocessableEntityException(
          `La tanda "${ticketType.name}" ya cerró su período de venta`
        );
      }

      if (item.quantity < ticketType.minPerOrder) {
        throw new UnprocessableEntityException(
          `La cantidad mínima por orden para "${ticketType.name}" es ${ticketType.minPerOrder}`
        );
      }

      if (item.quantity > ticketType.maxPerOrder) {
        throw new UnprocessableEntityException(
          `La cantidad máxima por orden para "${ticketType.name}" es ${ticketType.maxPerOrder}`
        );
      }
    }

    // 3. Calculate totals
    let subtotal = 0;
    for (let i = 0; i < dto.items.length; i++) {
      subtotal += dto.items[i].quantity * Number(ticketTypes[i]!.price);
    }
    subtotal = Math.round(subtotal * 100) / 100;

    // Orden fijado por `BR-COUPON-008`: subtotal -> cupón -> fee 15% sobre el
    // subtotal YA descontado -> total. Calcular el fee sobre el subtotal sin
    // descuento le cobraría de más al comprador.
    const coupon = dto.couponCode
      ? await this.couponService.applyToSubtotal(
          dto.eventUuid,
          dto.couponCode,
          // Las lineas, no el total: el cupon puede estar limitado a ciertas
          // tandas y el descuento se calcula solo sobre esas (BR-COUPON-009).
          dto.items.map((item, i) => ({
            ticketTypeUuid: item.ticketTypeUuid,
            subtotal: Math.round(item.quantity * Number(ticketTypes[i]!.price) * 100) / 100
          })),
          userId
        )
      : null;

    const discountAmount = coupon?.discountAmount ?? 0;
    const discountedSubtotal = coupon?.discountedSubtotal ?? subtotal;

    const serviceFee = Math.round(discountedSubtotal * SERVICE_FEE_RATE * 100) / 100;
    const total = Math.round((discountedSubtotal + serviceFee) * 100) / 100;

    // 4. Reserve stock — rollback and throw if any item fails
    const stockItems = dto.items.map(item => ({
      ticketTypeId: item.ticketTypeUuid,
      quantity: item.quantity
    }));

    const reserveResult = await this.stockService.reserveStock(stockItems);

    if (!reserveResult.success) {
      throw new ConflictException(
        `Sin stock disponible para la entrada: ${reserveResult.failedItem}`
      );
    }

    // 5 & 6. Create order and items inside a single transaction
    const expiresAt = new Date(Date.now() + ORDER_EXPIRY_MS);
    const orderNumber = this.generateOrderNumber();
    const currency = ticketTypes[0]!.currency;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let savedOrder: any;

    try {
      savedOrder = await queryRunner.manager.save('orders', {
        orderNumber,
        userUuid: userId,
        eventUuid: dto.eventUuid,
        status: OrderStatus.PENDING_PAYMENT,
        subtotal,
        couponUuid: coupon?.couponUuid ?? null,
        discountAmount,
        serviceFee,
        total,
        currency,
        expiresAt,
        metadata: null
      });

      const orderItemsData = dto.items.map((item, i) => ({
        orderUuid: savedOrder.uuid,
        ticketTypeUuid: item.ticketTypeUuid,
        quantity: item.quantity,
        unitPrice: Number(ticketTypes[i]!.price),
        subtotal: Math.round(item.quantity * Number(ticketTypes[i]!.price) * 100) / 100
      }));

      await queryRunner.manager.save('order_item', orderItemsData);

      // 7. Commit
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      await this.stockService.releaseStock(stockItems);
      this.logger.error('createOrder transaction failed', err);
      throw err;
    } finally {
      await queryRunner.release();
    }

    // 8. Enqueue release-expired-stock job (one per ticket type) with 10-min delay
    for (const item of stockItems) {
      const jobData: ReleaseExpiredStockJobData = {
        reservationId: savedOrder.uuid,
        ticketTypeId: item.ticketTypeId,
        quantity: item.quantity,
        expiredAt: expiresAt.toISOString()
      };
      await this.ordersQueue.add('release-expired-stock', jobData, {
        delay: ORDER_EXPIRY_MS
      });
    }

    // 9. Return the created order
    return this.fetchOrderInternal(savedOrder.uuid);
  }

  async getOrderById(orderId: string, userId: string): Promise<Order> {
    const order = await this.dbRepository.findOne({
      entity: 'orders',
      where: { uuid: orderId, userUuid: userId },
      relations: { items: { tickets: true } }
    });

    if (!order) {
      throw new NotFoundException('Orden no encontrada');
    }

    return this.mapToOrder(order);
  }

  async getUserOrders(
    userId: string,
    pagination: IPaginationParams
  ): Promise<PaginatedResult<Order>> {
    const { items, count } = await this.dbRepository.findManyAndCount({
      entity: 'orders',
      where: { userUuid: userId },
      relations: { items: { tickets: true } },
      other: {
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        order: { createdAt: 'DESC' }
      }
    });

    return {
      items: items.map(o => this.mapToOrder(o)),
      meta: new PaginationMetaResponse({
        total: count,
        page: pagination.page,
        limit: pagination.limit
      })
    };
  }

  async cancelOrder(orderId: string, userId: string): Promise<void> {
    const order = await this.dbRepository.findOne({
      entity: 'orders',
      where: { uuid: orderId, userUuid: userId },
      relations: { items: true }
    });

    if (!order) {
      throw new NotFoundException('Orden no encontrada');
    }

    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new UnprocessableEntityException(
        'Solo se pueden cancelar órdenes pendientes de pago'
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager.save('orders', {
        ...this.stripRelations(order),
        status: OrderStatus.CANCELLED
      });
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error('cancelOrder transaction failed', err);
      throw err;
    } finally {
      await queryRunner.release();
    }

    const stockItems = (order.items as any[]).map(item => ({
      ticketTypeId: item.ticketTypeUuid,
      quantity: item.quantity
    }));

    await this.stockService.releaseStock(stockItems);
  }

  async confirmPayment(orderId: string, paymentData: PaymentConfirmationData): Promise<Order> {
    // 1. Idempotency check — returns false if this paymentId was already processed
    const isFirstCall = await this.redisService.markIdempotency(
      `payment:${paymentData.paymentId}`,
      IDEMPOTENCY_TTL_SECONDS
    );

    if (!isFirstCall) {
      return this.fetchOrderInternal(orderId);
    }

    const order = await this.dbRepository.findOne({
      entity: 'orders',
      where: { uuid: orderId },
      relations: { items: true, user: true, event: true }
    });

    if (!order) {
      throw new NotFoundException('Orden no encontrada');
    }

    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new UnprocessableEntityException('La orden no está pendiente de pago');
    }

    // 2. Open QueryRunner and BEGIN
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const createdTickets: any[] = [];

    try {
      // 3. Update order to paid
      await queryRunner.manager.save('orders', {
        ...this.stripRelations(order),
        status: OrderStatus.PAID,
        paymentProvider: paymentData.paymentProvider,
        paymentId: paymentData.paymentId,
        paymentMethod: paymentData.paymentMethod,
        paidAt: paymentData.paidAt
      });

      // 4. Confirm stock (deduct availableQuantity) within the same transaction
      const stockItems = (order.items as any[]).map(item => ({
        ticketTypeId: item.ticketTypeUuid,
        quantity: item.quantity
      }));
      await this.stockService.confirmStock(stockItems, queryRunner);

      // Alertas de stock (`BR-EVENT-017`). Sin await: el aviso no puede
      // demorar ni tumbar una compra que ya se cobró. El servicio traga sus
      // propios errores.
      void this.stockAlertService.evaluateAfterSale(stockItems.map(i => i.ticketTypeId));

      // 5. Generate individual tickets within the same transaction
      for (const item of order.items as any[]) {
        for (let i = 0; i < item.quantity; i++) {
          const ticket = await queryRunner.manager.save('ticket', {
            orderItemUuid: item.uuid,
            userUuid: order.userUuid,
            eventUuid: order.eventUuid,
            ticketTypeUuid: item.ticketTypeUuid,
            ticketNumber: this.generateTicketNumber(),
            status: TicketStatus.ACTIVE,
            qrCode: null,
            qrUrl: null,
            pdfUrl: null,
            checkedInAt: null,
            checkedInBy: null
          });
          createdTickets.push({ ...ticket, ticketTypeUuid: item.ticketTypeUuid });
        }
      }

      // 6. Register fee summary (atomic upsert) within the same transaction.
      // If this fails, the whole transaction rolls back — the order never stays
      // in `paid` with an inconsistent fee summary.
      const ticketCount = (order.items as any[]).reduce((sum, item) => sum + item.quantity, 0);
      await this.feeSummaryService.registerPaidOrder({
        eventId: order.eventUuid,
        ticketCount,
        ticketAmount: Number(order.subtotal),
        serviceFeeAmount: Number(order.serviceFee),
        grossAmount: Number(order.total),
        currency: order.currency,
        queryRunner
      });

      // 7. Commit and release in finally
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error('confirmPayment transaction failed', err);
      throw err;
    } finally {
      await queryRunner.release();
    }

    // 8. Enqueue generate-qr job per ticket
    for (const ticket of createdTickets) {
      const jobData: GenerateQrJobData = {
        ticketId: ticket.uuid,
        orderId: order.uuid,
        userId: order.userUuid,
        eventId: order.eventUuid,
        ticketTypeId: ticket.ticketTypeUuid
      };
      await this.ticketsQueue.add('generate-qr', jobData);
    }

    // 9. Enqueue ONE email per order with all ticket PDFs attached.
    // Delay 15s gives generate-qr time to produce the PDFs; the processor
    // re-throws (retry with backoff) if any PDF is still missing.
    const emailJobData: SendOrderTicketsEmailJobData = { orderId: order.uuid };
    await this.notificationsQueue.add('send-order-tickets-email', emailJobData, {
      delay: 15000,
      attempts: 6,
      backoff: { type: 'exponential', delay: 10000 }
    });

    // In-app mirror of post-pago email (same path as email enqueue = once per first payment).
    const eventName =
      (order.event as { name?: string } | undefined)?.name?.trim() || 'tu evento';
    const orderShort = order.uuid.slice(0, 8).toUpperCase();
    this.userNotificationService
      .create(
        order.userUuid,
        'Compra confirmada',
        `Tu pago fue aprobado. Orden ${orderShort} · ${eventName}. Te enviamos las entradas por email.`
      )
      .catch(err => {
        this.logger.error(
          `Failed to create purchase notification for order ${order.uuid}`,
          err?.stack
        );
      });

    return this.fetchOrderInternal(orderId);
  }

  async expireOrder(orderId: string): Promise<void> {
    // 1. Verify order is still pending_payment
    const order = await this.dbRepository.findOne({
      entity: 'orders',
      where: { uuid: orderId },
      relations: { items: true }
    });

    if (!order || order.status !== OrderStatus.PENDING_PAYMENT) {
      return;
    }

    // 2. Update status to expired
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager.save('orders', {
        ...this.stripRelations(order),
        status: OrderStatus.EXPIRED
      });
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error('expireOrder transaction failed', err);
      throw err;
    } finally {
      await queryRunner.release();
    }

    // 3. Release reserved stock in Redis
    const stockItems = (order.items as any[]).map(item => ({
      ticketTypeId: item.ticketTypeUuid,
      quantity: item.quantity
    }));

    await this.stockService.releaseStock(stockItems);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async fetchOrderInternal(orderId: string): Promise<Order> {
    const order = await this.dbRepository.findOne({
      entity: 'orders',
      where: { uuid: orderId },
      relations: { items: { tickets: true } }
    });

    if (!order) {
      throw new NotFoundException('Orden no encontrada');
    }

    return this.mapToOrder(order);
  }

  private stripRelations(entity: any): any {
    const { user, event, items, tickets, orderItem, ticketType, order, ...fields } = entity;
    return fields;
  }

  private generateOrderNumber(): string {
    const suffix = uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();
    return `ORD-${Date.now()}-${suffix}`;
  }

  private generateTicketNumber(): string {
    const suffix = uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();
    return `TKT-${Date.now()}-${suffix}`;
  }

  private mapToOrder(entity: any): Order {
    const order = new Order();
    order.uuid = entity.uuid;
    order.orderNumber = entity.orderNumber;
    order.userUuid = entity.userUuid;
    order.eventUuid = entity.eventUuid;
    order.status = entity.status;
    order.subtotal = Number(entity.subtotal);
    order.serviceFee = Number(entity.serviceFee);
    order.total = Number(entity.total);
    order.currency = entity.currency;
    order.paymentProvider = entity.paymentProvider ?? null;
    order.paymentId = entity.paymentId ?? null;
    order.paymentMethod = entity.paymentMethod ?? null;
    order.paidAt = entity.paidAt ?? null;
    order.expiresAt = entity.expiresAt;
    order.metadata = entity.metadata ?? null;
    order.createdAt = entity.createdAt;
    order.updatedAt = entity.updatedAt;
    order.items = ((entity.items as any[]) ?? []).map(
      (item: any): IOrderItem => ({
        uuid: item.uuid,
        ticketTypeUuid: item.ticketTypeUuid,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.subtotal),
        tickets: ((item.tickets as any[]) ?? []).map(
          (ticket: any): IOrderTicket => ({
            uuid: ticket.uuid,
            ticketNumber: ticket.ticketNumber,
            qrCode: ticket.qrCode ?? null,
            qrUrl: ticket.qrUrl ?? null,
            pdfUrl: ticket.pdfUrl ?? null,
            status: ticket.status,
            checkedInAt: ticket.checkedInAt ?? null
          })
        )
      })
    );
    return order;
  }

  /**
   * BR-AUTH-003: en producción hace falta el email verificado para comprar.
   * Fuera de producción se omite, igual que en el login, para no frenar las
   * pruebas con cuentas descartables.
   */
  private async assertBuyerCanPurchase(userId: string): Promise<void> {
    if (String(process.env.NODE_ENV ?? '').toLowerCase() !== 'production') return;

    const user = await this.dbRepository.findOne({
      entity: 'user',
      where: { uuid: userId }
    });

    if (!user?.emailVerified) {
      throw new UnprocessableEntityException(
        'Tenés que verificar tu correo antes de comprar. Revisá tu bandeja de entrada.'
      );
    }
  }
}
