import { Payment, PaymentInitResponse } from '../core/payment';

export interface IPaymentService {
  initializePayment(orderId: string, userId: string): Promise<PaymentInitResponse>;
  processWebhook(provider: string, payload: unknown): Promise<void>;
  /** `userId` acota la busqueda al dueño de la orden: sin eso el id es adivinable. */
  getPaymentByOrder(orderId: string, userId: string): Promise<Payment>;
  refundPayment(orderId: string, userId: string): Promise<void>;
}
