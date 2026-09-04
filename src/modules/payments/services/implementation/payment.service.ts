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
import { MercadoPagoService, MPOrderItem } from './mercadopago.service';
import { IPaymentService } from '../contracts/ipayment.service';
import { Payment, PaymentInitResponse } from '../core/payment';
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
    @InjectQueue(QUEUE_NAMES.PAYMENTS) private readonly paymentsQueue: Queue
  ) {}

  async initializePayment(orderId: string, userId: string): Promise<PaymentInitResponse> {
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
      eventName: event?.name ?? 'Evento'
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

    const { checkoutUrl, preferenceId } = await this.mercadoPagoService.initializePreference(
      orderForMP,
      userForMP as any
    );

    const paymentUuid = uuidv4();

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
