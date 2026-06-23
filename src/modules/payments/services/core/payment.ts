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
