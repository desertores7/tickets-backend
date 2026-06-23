import { Payment, PaymentInitResponse } from '../core/payment';

export interface IPaymentService {
  initializePayment(orderId: string, userId: string): Promise<PaymentInitResponse>;
  processWebhook(provider: string, payload: unknown): Promise<void>;
  getPaymentByOrder(orderId: string): Promise<Payment>;
  refundPayment(orderId: string, userId: string): Promise<void>;
}
