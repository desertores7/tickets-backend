import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { ICreateOrder, Order, PaymentConfirmationData } from '../core/order';

export type PaginatedResult<T> = {
  meta: PaginationMetaResponse;
  items: T[];
};

export interface IOrderService {
  createOrder(userId: string, dto: ICreateOrder): Promise<Order>;

  getOrderById(orderId: string, userId: string): Promise<Order>;

  getUserOrders(
    userId: string,
    pagination: IPaginationParams,
    status?: string
  ): Promise<PaginatedResult<Order>>;

  cancelOrder(orderId: string, userId: string): Promise<void>;

  confirmPayment(orderId: string, paymentData: PaymentConfirmationData): Promise<Order>;

  expireOrder(orderId: string): Promise<void>;
}
