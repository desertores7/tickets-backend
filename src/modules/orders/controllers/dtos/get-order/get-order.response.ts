import { ApiProperty } from '@nestjs/swagger';
import { IOrderItem, IOrderTicket, Order, OrderStatus, TicketStatus } from '@modules/orders/services/core/order';

export class OrderTicketResponse {
  @ApiProperty() uuid: string;
  @ApiProperty() ticketNumber: string;
  @ApiProperty({ nullable: true }) qrCode: string | null;
  @ApiProperty({ nullable: true }) qrUrl: string | null;
  @ApiProperty({ nullable: true }) pdfUrl: string | null;
  @ApiProperty({ enum: TicketStatus }) status: TicketStatus;
  @ApiProperty({ nullable: true }) checkedInAt: Date | null;

  constructor(data: IOrderTicket) {
    this.uuid = data.uuid;
    this.ticketNumber = data.ticketNumber;
    this.qrCode = data.qrCode;
    this.qrUrl = data.qrUrl;
    this.pdfUrl = data.pdfUrl;
    this.status = data.status;
    this.checkedInAt = data.checkedInAt;
  }
}

export class OrderItemResponse {
  @ApiProperty() uuid: string;
  @ApiProperty() ticketTypeUuid: string;
  @ApiProperty() quantity: number;
  @ApiProperty() unitPrice: number;
  @ApiProperty() subtotal: number;
  @ApiProperty({ type: [OrderTicketResponse] }) tickets: OrderTicketResponse[];

  constructor(data: IOrderItem) {
    this.uuid = data.uuid;
    this.ticketTypeUuid = data.ticketTypeUuid;
    this.quantity = data.quantity;
    this.unitPrice = Number(data.unitPrice);
    this.subtotal = Number(data.subtotal);
    this.tickets = data.tickets.map(t => new OrderTicketResponse(t));
  }
}

export class GetOrderResponse {
  @ApiProperty() uuid: string;
  @ApiProperty() orderNumber: string;
  @ApiProperty() userUuid: string;
  @ApiProperty() eventUuid: string;
  @ApiProperty({ enum: OrderStatus }) status: OrderStatus;
  @ApiProperty() subtotal: number;
  @ApiProperty() serviceFee: number;
  @ApiProperty() total: number;
  @ApiProperty() currency: string;
  @ApiProperty({ nullable: true }) paymentProvider: string | null;
  @ApiProperty({ nullable: true }) paymentId: string | null;
  @ApiProperty({ nullable: true }) paymentMethod: string | null;
  @ApiProperty({ nullable: true }) paidAt: Date | null;
  @ApiProperty() expiresAt: Date;
  @ApiProperty({ nullable: true, type: Object, additionalProperties: true }) metadata: Record<string, unknown> | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
  @ApiProperty({ type: [OrderItemResponse] }) items: OrderItemResponse[];

  constructor(data: Order) {
    this.uuid = data.uuid;
    this.orderNumber = data.orderNumber;
    this.userUuid = data.userUuid;
    this.eventUuid = data.eventUuid;
    this.status = data.status;
    this.subtotal = Number(data.subtotal);
    this.serviceFee = Number(data.serviceFee);
    this.total = Number(data.total);
    this.currency = data.currency;
    this.paymentProvider = data.paymentProvider;
    this.paymentId = data.paymentId;
    this.paymentMethod = data.paymentMethod;
    this.paidAt = data.paidAt;
    this.expiresAt = data.expiresAt;
    this.metadata = data.metadata;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
    this.items = (data.items ?? []).map(i => new OrderItemResponse(i));
  }
}
