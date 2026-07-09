import { Injectable, Logger } from '@nestjs/common';
import { MercadoPagoConfig, Preference, Payment as MPPaymentClient } from 'mercadopago';
import { EnvService } from '@config/env/env.service';
import { PaymentStatus } from '@config/db/entities/tickets/payment.entity';
import { MercadoPagoWebhookRequest } from '@modules/payments/controllers/dtos/webhook/mercadopago-webhook.request';
import { IOrderItem, Order } from '@modules/orders/services/core/order';
import { User } from '@modules/user/services/core/user';

export type MPOrderItem = IOrderItem & { title: string };
export type OrderForMP = Omit<Order, 'items'> & { items: MPOrderItem[] };

export interface MPPreferenceResult {
  checkoutUrl: string;
  preferenceId: string;
}

export interface PaymentWebhookResult {
  orderId: string;
  internalStatus: PaymentStatus;
  mpPaymentId: string;
  mpStatus: string;
  amount: number;
  currency: string;
  paymentMethod: string | null;
  paymentType: string | null;
  installments: number | null;
  paidAt: Date | null;
  rawResponse: Record<string, unknown>;
}

const MP_STATUS_MAP: Record<string, PaymentStatus> = {
  approved: PaymentStatus.APPROVED,
  rejected: PaymentStatus.REJECTED,
  pending: PaymentStatus.PENDING,
  in_process: PaymentStatus.IN_PROCESS,
  cancelled: PaymentStatus.CANCELLED,
  refunded: PaymentStatus.REFUNDED,
  charged_back: PaymentStatus.REFUNDED
};

@Injectable()
export class MercadoPagoService {
  private readonly logger = new Logger(MercadoPagoService.name);
  private readonly client: MercadoPagoConfig;

  constructor(private readonly envService: EnvService) {
    const accessToken = this.envService.get('MERCADOPAGO_ACCESS_TOKEN');
    if (!accessToken) {
      this.logger.warn('MERCADOPAGO_ACCESS_TOKEN is not configured — payment features will not work');
    }
    this.client = new MercadoPagoConfig({ accessToken: accessToken ?? '' });
  }

  async initializePreference(order: OrderForMP, user: User): Promise<MPPreferenceResult> {
    const preference = new Preference(this.client);

    const appUrl = (this.envService.get('APP_URL') ?? '').replace(/\/$/, '');
    // back_urls son páginas que ve el comprador → frontend. notification_url es el webhook → backend.
    const frontendUrl = (this.envService.get('FRONTEND_URL') ?? '').replace(/\/$/, '');
    const backUrlSuccess = `${frontendUrl}/payment/success`;
    const backUrlFailure = `${frontendUrl}/payment/failure`;
    const backUrlPending = `${frontendUrl}/payment/pending`;
    const notificationUrl = `${appUrl}/api/v1/payments/webhook/mercadopago`;

    try {
      const result = await preference.create({
        body: {
          items: order.items.map(item => ({
            id: item.uuid,
            title: item.title,
            quantity: item.quantity,
            unit_price: Number(item.unitPrice),
            currency_id: order.currency
          })),
          payer: {
            name: user.firstName,
            surname: user.lastName,
            email: user.email
          },
          back_urls: {
            success: backUrlSuccess ?? '',
            failure: backUrlFailure ?? '',
            pending: backUrlPending ?? ''
          },
          auto_return: 'approved' as const,
          notification_url: notificationUrl,
          external_reference: order.uuid,
          expires: true,
          expiration_date_to: order.expiresAt.toISOString(),
          statement_descriptor: 'TICKETERA'
        }
      });

      if (!result.init_point || !result.id) {
        throw new Error('MercadoPago did not return init_point or preference id');
      }

      return {
        checkoutUrl: result.init_point,
        preferenceId: result.id
      };
    } catch (error) {
      this.logger.error('Failed to create MercadoPago preference', {
        orderId: order.uuid,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  async processWebhookPayload(payload: MercadoPagoWebhookRequest): Promise<PaymentWebhookResult | null> {
    if (payload.type !== 'payment') {
      this.logger.log(`Ignoring MP webhook with type: ${payload.type}`);
      return null;
    }

    const mpPaymentId = payload.data?.id;
    if (!mpPaymentId) {
      this.logger.warn('MP payment webhook without data.id — ignored');
      return null;
    }

    try {
      const mpClient = new MPPaymentClient(this.client);
      const paymentData = await mpClient.get({ id: mpPaymentId });

      const orderId = paymentData.external_reference ?? '';
      const mpStatus = paymentData.status ?? '';
      const internalStatus = MP_STATUS_MAP[mpStatus] ?? PaymentStatus.PENDING;

      return {
        orderId,
        internalStatus,
        mpPaymentId: String(paymentData.id),
        mpStatus,
        amount: paymentData.transaction_amount ?? 0,
        currency: paymentData.currency_id ?? 'ARS',
        paymentMethod: paymentData.payment_method_id ?? null,
        paymentType: paymentData.payment_type_id ?? null,
        installments: paymentData.installments ?? null,
        paidAt: paymentData.date_approved ? new Date(paymentData.date_approved) : null,
        rawResponse: paymentData as unknown as Record<string, unknown>
      };
    } catch (error) {
      this.logger.error('Failed to fetch payment from MercadoPago', {
        mpPaymentId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}
