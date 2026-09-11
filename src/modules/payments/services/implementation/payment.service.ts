import { Injectable, Inject, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DBRepository } from '@config/db/db.repository';
import { RedisService } from '@config/redis/redis.service';
import { QUEUE_NAMES, ProcessWebhookJobData } from '@config/redis/bull-jobs.types';
import { PaymentProvider, PaymentStatus } from '@config/db/entities/tickets/payment.entity';
import { OrderStatus } from '@modules/orders/services/core/order';
import { IOrderService } from '@modules/orders/services/contracts/iorder.service';
import {
  CardPaymentInput,
  CardPaymentResult,
  MercadoPagoService,
  MPOrderItem,
  OrderForMP
} from './mercadopago.service';
import { IPaymentService } from '../contracts/ipayment.service';
import { CardPaymentOutcome, Payment, PaymentInitResponse } from '../core/payment';
import { describeCardRejection, describeInProcess } from '../core/card-rejection';
import { MercadoPagoWebhookRequest } from '../../controllers/dtos/webhook/mercadopago-webhook.request';

const WEBHOOK_IDEMPOTENCY_TTL = 86400;

@Injectable()
export class PaymentService implements IPaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @Inject(DBRepository) private readonly dbRepository: DBRepository,
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource,
    private readonly mercadoPagoService: MercadoPagoService,
    @InjectQueue(QUEUE_NAMES.PAYMENTS) private readonly paymentsQueue: Queue,
    // Con tarjeta el pago se resuelve en la misma request: si se aprueba, la
    // orden se confirma acá y no en el processor del webhook.
    @Inject('IOrderService') private readonly orderService: IOrderService
  ) {}

  /**
   * Carga la orden y arma lo que Mercado Pago necesita, con las mismas
   * validaciones para los dos caminos de pago: Checkout Pro y tarjeta.
   */
  private async loadForMercadoPago(
    orderId: string,
    userId: string
  ): Promise<{ order: any; orderForMP: OrderForMP; userForMP: any }> {
    const order = await this.dbRepository.findOne({
      entity: 'orders',
      where: { uuid: orderId },
      relations: { items: true }
    });

    if (!order || order.userUuid !== userId) {
      throw new NotFoundException('Orden no encontrada');
    }

    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new UnprocessableEntityException(
        'Solo se puede iniciar el pago de órdenes pendientes de pago'
      );
    }

    const user = await this.dbRepository.findOne({
      entity: 'user',
      where: { uuid: userId }
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const event = await this.dbRepository.findOne({
      entity: 'event',
      where: { uuid: order.eventUuid }
    });

    const ticketTypes = await Promise.all(
      (order.items as any[]).map((item: any) =>
        this.dbRepository.findOne({
          entity: 'ticket_type',
          where: { uuid: item.ticketTypeUuid }
        })
      )
    );

    const enrichedItems: MPOrderItem[] = (order.items as any[]).map((item: any, i) => ({
      uuid: item.uuid,
      ticketTypeUuid: item.ticketTypeUuid,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
      tickets: item.tickets ?? [],
      title: ticketTypes[i]?.name ?? 'Entrada'
    }));

    const orderForMP = {
      uuid: order.uuid,
      orderNumber: order.orderNumber,
      userUuid: order.userUuid,
      eventUuid: order.eventUuid,
      status: order.status as any,
      subtotal: order.subtotal,
      serviceFee: order.serviceFee,
      total: order.total,
      currency: order.currency,
      paymentProvider: order.paymentProvider,
      paymentId: order.paymentId,
      paymentMethod: order.paymentMethod,
      paidAt: order.paidAt,
      expiresAt: order.expiresAt,
      metadata: order.metadata,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: enrichedItems,
      eventName: event?.name ?? 'Evento',
      eventSlug: event?.slug ?? null
    };

    const userForMP = {
      uuid: user.uuid,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      dni: user.dni,
      gender: user.gender,
      password: user.password,
      birthday: user.birthday,
      active: user.active,
      isDeleted: user.isDeleted,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      createdBy: user.createdBy,
      updatedBy: user.updatedBy
    };

    return { order, orderForMP, userForMP };
  }

  async initializePayment(orderId: string, userId: string): Promise<PaymentInitResponse> {
    const { order, orderForMP, userForMP } = await this.loadForMercadoPago(orderId, userId);

    const { checkoutUrl, preferenceId } = await this.mercadoPagoService.initializePreference(
      orderForMP,
      userForMP as any
    );

    // `payment.orderUuid` es UNIQUE: una orden tiene como mucho una fila de
    // pago. Reintentar el checkout (volver de Mercado Pago sin pagar y tocar
    // "Pagar" de nuevo) tiene que reescribir la preferencia sobre esa misma
    // fila; insertando otra, MySQL responde ER_DUP_ENTRY y el comprador ve un
    // "Internal server error" en vez del checkout.
    const existingPayment = await this.dbRepository.findOne({
      entity: 'payment',
      where: { orderUuid: orderId }
    });

    const paymentUuid = existingPayment?.uuid ?? uuidv4();

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager.save('payment', {
        uuid: paymentUuid,
        orderUuid: orderId,
        provider: PaymentProvider.MERCADOPAGO,
        providerPaymentId: preferenceId,
        providerStatus: 'preference_created',
        status: PaymentStatus.PENDING,
        amount: order.total,
        currency: order.currency,
        paymentMethod: null,
        paymentType: null,
        installments: null,
        rawResponse: { preferenceId }
      });

      await queryRunner.manager.save('orders', {
        uuid: order.uuid,
        orderNumber: order.orderNumber,
        userUuid: order.userUuid,
        eventUuid: order.eventUuid,
        status: order.status,
        subtotal: order.subtotal,
        serviceFee: order.serviceFee,
        total: order.total,
        currency: order.currency,
        paymentProvider: PaymentProvider.MERCADOPAGO,
        paymentId: preferenceId,
        paymentMethod: order.paymentMethod,
        paidAt: order.paidAt,
        expiresAt: order.expiresAt,
        metadata: order.metadata
      });

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error('initializePayment transaction failed', err);
      throw err;
    } finally {
      await queryRunner.release();
    }

    return {
      checkoutUrl,
      preferenceId,
      paymentId: paymentUuid
    };
  }

  /**
   * Cobro con tarjeta en la plataforma — Checkout API (`BR-PAY-006`).
   *
   * A diferencia de Checkout Pro, **la respuesta llega en el acto**: acá mismo
   * se sabe si el pago se aprobó, y si se aprobó se confirma la orden sin
   * esperar al webhook. El webhook igual llega después con el mismo
   * `payment_id`, y `confirmPayment` lo descarta por idempotencia.
   *
   * Un rechazo **no cancela la orden**: el comprador sigue en la pantalla y
   * puede reintentar con otra tarjeta mientras el hold de stock siga vivo.
   */
  async payWithCard(
    orderId: string,
    userId: string,
    card: CardPaymentInput
  ): Promise<CardPaymentOutcome> {
    const { order, orderForMP, userForMP } = await this.loadForMercadoPago(orderId, userId);

    // El hold de stock ya venció: cobrar acá sería cobrarle por entradas que
    // ya volvieron a la venta.
    if (order.expiresAt && new Date(order.expiresAt).getTime() <= Date.now()) {
      throw new UnprocessableEntityException(
        'La reserva venció. Volvé a elegir tus entradas.'
      );
    }

    const result = await this.mercadoPagoService.createCardPayment(
      orderForMP,
      userForMP as any,
      card
    );

    await this.persistCardPayment(order, result);

    if (result.status === PaymentStatus.APPROVED) {
      await this.orderService.confirmPayment(order.uuid, {
        paymentProvider: 'mercadopago',
        paymentId: result.mpPaymentId,
        paymentMethod: result.paymentMethod ?? 'card',
        paidAt: result.paidAt ?? new Date()
      });
    }

    return {
      paymentId: result.mpPaymentId,
      status: result.status,
      statusDetail: result.statusDetail,
      message: this.describeOutcome(result),
      retryable:
        result.status === PaymentStatus.REJECTED
          ? describeCardRejection(result.statusDetail).retryable
          : false,
      installments: result.installments,
      paymentMethod: result.paymentMethod
    };
  }

  private describeOutcome(result: CardPaymentResult): string {
    if (result.status === PaymentStatus.APPROVED) {
      return 'Pago aprobado. Ya te estamos generando las entradas.';
    }
    if (result.status === PaymentStatus.IN_PROCESS || result.status === PaymentStatus.PENDING) {
      return describeInProcess(result.statusDetail);
    }
    return describeCardRejection(result.statusDetail).message;
  }

  /**
   * Deja la fila de `payment` reflejando el último intento. Se pisa la anterior
   * en vez de acumular: la orden tiene un solo pago, y los intentos fallidos
   * quedan en `rawResponse` del que quedó.
   */
  private async persistCardPayment(order: any, result: CardPaymentResult): Promise<void> {
    const existing = await this.dbRepository.findOne({
      entity: 'payment',
      where: { orderUuid: order.uuid }
    });

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager.save('payment', {
        ...((existing as any) ?? { uuid: uuidv4(), orderUuid: order.uuid }),
        provider: PaymentProvider.MERCADOPAGO,
        providerPaymentId: result.mpPaymentId,
        providerStatus: result.statusDetail
          ? `${result.mpStatus}:${result.statusDetail}`
          : result.mpStatus,
        status: result.status,
        amount: result.amount,
        currency: result.currency,
        paymentMethod: result.paymentMethod,
        paymentType: result.paymentType,
        installments: result.installments,
        rawResponse: result.rawResponse
      });

      await queryRunner.manager.save('orders', {
        uuid: order.uuid,
        orderNumber: order.orderNumber,
        userUuid: order.userUuid,
        eventUuid: order.eventUuid,
        status: order.status,
        subtotal: order.subtotal,
        serviceFee: order.serviceFee,
        total: order.total,
        currency: order.currency,
        paymentProvider: PaymentProvider.MERCADOPAGO,
        paymentId: result.mpPaymentId,
        paymentMethod: result.paymentMethod,
        paidAt: order.paidAt,
        expiresAt: order.expiresAt,
        metadata: order.metadata
      });

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error('payWithCard transaction failed', err);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async processWebhook(provider: string, payload: unknown): Promise<void> {
    const webhookPayload = payload as MercadoPagoWebhookRequest;
    const paymentId = webhookPayload?.data?.id ?? 'unknown';
    const idempotencyKey = `webhook:${provider}:${paymentId}`;

    const isFirst = await this.redisService.markIdempotency(idempotencyKey, WEBHOOK_IDEMPOTENCY_TTL);
    if (!isFirst) {
      this.logger.log(`Duplicate webhook ignored: ${idempotencyKey}`);
      return;
    }

    const jobData: ProcessWebhookJobData = {
      provider,
      event: webhookPayload?.type ?? 'unknown',
      payload: payload as Record<string, unknown>,
      idempotencyKey,
      receivedAt: new Date().toISOString()
    };

    await this.paymentsQueue.add('process-webhook', jobData, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 }
    });

    this.logger.log(`Webhook enqueued: ${idempotencyKey}`);
  }

  async getPaymentByOrder(orderId: string, userId: string): Promise<Payment> {
    // Primero la orden y su dueño: si no es de esta persona, el pago no existe
    // para ella. Se responde 404 y no 403 para no confirmar que la orden existe.
    const order = await this.dbRepository.findOne({
      entity: 'orders',
      where: { uuid: orderId, userUuid: userId }
    });

    if (!order) {
      throw new NotFoundException('Pago no encontrado para esta orden');
    }

    const entity = await this.dbRepository.findOne({
      entity: 'payment',
      where: { orderUuid: orderId }
    });

    if (!entity) {
      throw new NotFoundException('Pago no encontrado para esta orden');
    }

    return this.mapToPayment(entity as any);
  }

  async refundPayment(_orderId: string, _userId: string): Promise<void> {
    this.logger.warn('refundPayment is not yet implemented');
  }

  private mapToPayment(entity: any): Payment {
    const p = new Payment();
    p.uuid = entity.uuid;
    p.orderUuid = entity.orderUuid;
    p.provider = entity.provider;
    p.providerPaymentId = entity.providerPaymentId;
    p.providerStatus = entity.providerStatus;
    p.status = entity.status;
    p.amount = entity.amount;
    p.currency = entity.currency;
    p.paymentMethod = entity.paymentMethod;
    p.paymentType = entity.paymentType;
    p.installments = entity.installments;
    p.rawResponse = entity.rawResponse;
    p.createdAt = entity.createdAt;
    p.updatedAt = entity.updatedAt;
    return p;
  }
}
