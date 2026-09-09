import { PaymentProvider, PaymentStatus } from '@config/db/entities/tickets/payment.entity';

export { PaymentProvider, PaymentStatus };

export interface IPayment {
  uuid: string;
  orderUuid: string;
  provider: PaymentProvider;
  providerPaymentId: string;
  providerStatus: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  paymentMethod: string | null;
  paymentType: string | null;
  installments: number | null;
  rawResponse: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class Payment implements IPayment {
  uuid: string;
  orderUuid: string;
  provider: PaymentProvider;
  providerPaymentId: string;
  providerStatus: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  paymentMethod: string | null;
  paymentType: string | null;
  installments: number | null;
  rawResponse: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentInitResponse {
  checkoutUrl: string;
  preferenceId: string;
  paymentId: string;
}

/** Resultado de un cobro con tarjeta, ya traducido para mostrarle al comprador. */
export interface CardPaymentOutcome {
  /** `payment_id` de Mercado Pago: con este se reclama y se reembolsa. */
  paymentId: string;
  status: PaymentStatus;
  /** El motivo fino que devolvió MP, para soporte. */
  statusDetail: string | null;
  /** Qué mostrarle al comprador. Dice qué hacer, no qué pasó. */
  message: string;
  /** Si puede corregir y reintentar con la misma tarjeta. */
  retryable: boolean;
  installments: number | null;
  paymentMethod: string | null;
}
