export enum OrderStatus {
  PENDING_PAYMENT = 'pending_payment',
  PAID = 'paid',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  REFUNDED = 'refunded'
}

export enum TicketStatus {
  ACTIVE = 'active',
  USED = 'used',
  CANCELLED = 'cancelled',
  TRANSFERRED = 'transferred'
}

export interface IOrderTicket {
  uuid: string;
  ticketNumber: string;
  qrCode: string | null;
  qrUrl: string | null;
  pdfUrl: string | null;
  status: TicketStatus;
  checkedInAt: Date | null;
}

export interface IOrderItem {
  uuid: string;
  ticketTypeUuid: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  tickets: IOrderTicket[];
}

export interface IOrder {
  uuid: string;
  orderNumber: string;
  userUuid: string;
  eventUuid: string;
  status: OrderStatus;
  subtotal: number;
  serviceFee: number;
  total: number;
  currency: string;
  paymentProvider: string | null;
  paymentId: string | null;
  paymentMethod: string | null;
  paidAt: Date | null;
  expiresAt: Date;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  items: IOrderItem[];
}

export class Order implements IOrder {
  uuid: string;
  orderNumber: string;
  userUuid: string;
  eventUuid: string;
  status: OrderStatus;
  subtotal: number;
  serviceFee: number;
  total: number;
  currency: string;
  paymentProvider: string | null;
  paymentId: string | null;
  paymentMethod: string | null;
  paidAt: Date | null;
  expiresAt: Date;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  items: IOrderItem[];
  /** Solo en el listado: evita un fetch del evento por fila. */
  eventName?: string | null;
  eventStartDate?: Date | null;
  /** Solo en el listado: suma de cantidades, calculada en SQL. */
  itemCount?: number;
  /**
   * Entradas de la orden ya reembolsadas.
   *
   * Va aparte de `status`: un reembolso puede ser parcial (`BR-REFUND-009`) y la
   * orden sigue siendo una compra pagada. Sin este dato el comprador ve
   * "Pagada" en una compra que le devolvieron.
   */
  refundedCount?: number;
}

export interface ICreateOrderItem {
  ticketTypeUuid: string;
  quantity: number;
}

export interface ICreateOrder {
  eventUuid: string;
  items: ICreateOrderItem[];
  /** Código de cupón opcional (BR-COUPON-008). */
  couponCode?: string;
}

export interface PaymentConfirmationData {
  paymentProvider: string;
  paymentId: string;
  paymentMethod: string;
  paidAt: Date;
}
