import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { DBRepository } from '@config/db/db.repository';
import { QUEUE_NAMES, ProcessWebhookJobData } from '@config/redis/bull-jobs.types';
import { PaymentStatus } from '@config/db/entities/tickets/payment.entity';
import { IOrderService } from '@modules/orders/services/contracts/iorder.service';
import { MercadoPagoService } from '../services/implementation/mercadopago.service';
import { MercadoPagoWebhookRequest } from '../controllers/dtos/webhook/mercadopago-webhook.request';

@Processor(QUEUE_NAMES.PAYMENTS)
export class ProcessWebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(ProcessWebhookProcessor.name);

  constructor(
    private readonly mercadoPagoService: MercadoPagoService,
    @Inject('IOrderService') private readonly orderService: IOrderService,
    @Inject(DBRepository) private readonly dbRepository: DBRepository,
    private readonly dataSource: DataSource
  ) {
    super();
  }

  async process(job: Job<ProcessWebhookJobData>): Promise<void> {
    if (job.name !== 'process-webhook') return;

    const { provider, payload } = job.data;
    this.logger.log(`Processing webhook job=${job.id} provider=${provider}`);

    if (provider !== 'mercadopago') {
      this.logger.warn(`Unknown webhook provider: ${provider}`);
      return;
    }

    const webhookPayload = payload as unknown as MercadoPagoWebhookRequest;
    const result = await this.mercadoPagoService.processWebhookPayload(webhookPayload);

    if (!result) {
      this.logger.log(`Webhook ignored (non-payment event), job=${job.id}`);
      return;
    }

    this.logger.log(
      `Webhook result: orderId=${result.orderId} mpStatus=${result.mpStatus} internalStatus=${result.internalStatus}`
    );

    const existingPayment = await this.dbRepository.findOne({
      entity: 'payment',
      where: { orderUuid: result.orderId }
    });

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (existingPayment) {
        await queryRunner.manager.save('payment', {
          ...(existingPayment as any),
          providerPaymentId: result.mpPaymentId,
          providerStatus: result.mpStatus,
          status: result.internalStatus,
          amount: result.amount,
          currency: result.currency,
          paymentMethod: result.paymentMethod,
          paymentType: result.paymentType,
          installments: result.installments,
          rawResponse: result.rawResponse
        });
      }

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`process-webhook transaction failed, job=${job.id}`, err);
      throw err;
    } finally {
      await queryRunner.release();
    }

    if (result.internalStatus === PaymentStatus.APPROVED) {
      try {
        await this.orderService.confirmPayment(result.orderId, {
          paymentProvider: 'mercadopago',
          paymentId: result.mpPaymentId,
          paymentMethod: result.paymentMethod ?? '',
          paidAt: result.paidAt ?? new Date()
        });
        this.logger.log(`Order confirmed: orderId=${result.orderId}`);
      } catch (err) {
        this.logger.error(`confirmPayment failed for orderId=${result.orderId}`, err);
        throw err;
      }
    } else if (
      result.internalStatus === PaymentStatus.REJECTED ||
      result.internalStatus === PaymentStatus.CANCELLED
    ) {
      try {
        await this.orderService.expireOrder(result.orderId);
        this.logger.log(`Order expired: orderId=${result.orderId} reason=${result.internalStatus}`);
      } catch (err) {
        this.logger.error(`expireOrder failed for orderId=${result.orderId}`, err);
        throw err;
      }
    } else {
      this.logger.log(
        `No order transition for status=${result.internalStatus}, orderId=${result.orderId}`
      );
    }
  }
}
