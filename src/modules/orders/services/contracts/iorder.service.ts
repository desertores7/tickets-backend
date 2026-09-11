import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { IOrderParams } from '@root/shared/decorators/order-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { ICreateOrder, Order, PaymentConfirmationData } from '../core/order';
import { USER_ORDER_LIST_COLUMNS } from '../../const/user-order-list.const';

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
    opts?: {
      status?: string;
      search?: string;
      order?: IOrderParams<typeof USER_ORDER_LIST_COLUMNS>;
    }
  ): Promise<PaginatedResult<Order>>;

  cancelOrder(orderId: string, userId: string): Promise<void>;

  confirmPayment(orderId: string, paymentData: PaymentConfirmationData): Promise<Order>;

  expireOrder(orderId: string): Promise<void>;
  sweepExpiredOrders(batchSize?: number): Promise<number>;
}
