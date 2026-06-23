import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { Order, OrderStatus } from '@modules/orders/services/core/order';

export class OrderSummaryResponse {
  @ApiProperty() uuid: string;
  @ApiProperty() orderNumber: string;
  @ApiProperty() eventUuid: string;
  @ApiProperty({ enum: OrderStatus }) status: OrderStatus;
  @ApiProperty() total: number;
  @ApiProperty() currency: string;
  @ApiProperty() itemCount: number;
  @ApiProperty() expiresAt: Date;
  @ApiProperty({ nullable: true }) paidAt: Date | null;
  @ApiProperty() createdAt: Date;

  constructor(data: Order) {
    this.uuid = data.uuid;
    this.orderNumber = data.orderNumber;
    this.eventUuid = data.eventUuid;
    this.status = data.status;
    this.total = Number(data.total);
    this.currency = data.currency;
    this.itemCount = (data.items ?? []).reduce((sum, item) => sum + item.quantity, 0);
    this.expiresAt = data.expiresAt;
    this.paidAt = data.paidAt;
    this.createdAt = data.createdAt;
  }
}

export class GetUserOrdersResponse {
  @ApiProperty({ type: [OrderSummaryResponse] }) items: OrderSummaryResponse[];
  @ApiProperty({ type: PaginationMetaResponse }) meta: PaginationMetaResponse;

  constructor(items: OrderSummaryResponse[], meta: PaginationMetaResponse) {
    this.items = items;
    this.meta = meta;
  }
}
