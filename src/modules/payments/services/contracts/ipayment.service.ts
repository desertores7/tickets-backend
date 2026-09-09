import { CardPaymentInput } from '../implementation/mercadopago.service';
import { CardPaymentOutcome, Payment, PaymentInitResponse } from '../core/payment';

export interface IPaymentService {
  initializePayment(orderId: string, userId: string): Promise<PaymentInitResponse>;
  /** Cobro con tarjeta en la plataforma. `card.token` nunca contiene datos de tarjeta. */
  payWithCard(
    orderId: string,
    userId: string,
    card: CardPaymentInput
  ): Promise<CardPaymentOutcome>;
  processWebhook(provider: string, payload: unknown): Promise<void>;
  /** `userId` acota la busqueda al dueño de la orden: sin eso el id es adivinable. */
  getPaymentByOrder(orderId: string, userId: string): Promise<Payment>;
  refundPayment(orderId: string, userId: string): Promise<void>;
}
