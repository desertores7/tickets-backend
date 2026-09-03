import { ApiProperty } from '@nestjs/swagger';
import { TicketStatus } from '@config/db/entities/tickets/ticket.entity';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';

export interface TicketSummaryData {
  uuid: string;
  ticketNumber: string;
  status: TicketStatus;
  qrUrl: string | null;
  pdfUrl: string | null;
  eventUuid: string;
  eventName: string;
  eventDate: Date;
  eventEndDate: Date;
  eventBannerUrl: string | null;
  venueName: string;
  venueCity: string | null;
  ticketTypeName: string;
  ticketTypePrice: number | null;
  orderUuid: string | null;
  orderNumber: string | null;
  createdAt: Date;
}

export class TicketSummaryResponse {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }) id: string;
  @ApiProperty({ example: 'TKT-20250315-000142' }) ticketNumber: string;
  @ApiProperty({ enum: TicketStatus, example: TicketStatus.ACTIVE }) status: TicketStatus;
  @ApiProperty({ nullable: true, example: 'https://api.example.com/static/tickets/qr/uuid.png' }) qrUrl: string | null;
  @ApiProperty({ nullable: true, example: 'https://api.example.com/static/tickets/pdf/uuid.pdf' }) pdfUrl: string | null;
  @ApiProperty() eventUuid: string;
  @ApiProperty({ example: 'Lollapalooza Argentina 2025' }) eventName: string;
  @ApiProperty() eventDate: Date;
  @ApiProperty({ description: 'Fin del evento: define si la entrada ya es pasada.' }) eventEndDate: Date;
  @ApiProperty({ nullable: true }) eventBannerUrl: string | null;
  @ApiProperty({ example: 'Hipódromo de San Isidro' }) venueName: string;
  @ApiProperty({ nullable: true, example: 'San Isidro' }) venueCity: string | null;
  @ApiProperty({ example: 'Campo General' }) ticketTypeName: string;
  @ApiProperty({ nullable: true, description: 'Precio pagado por esta entrada.' }) ticketTypePrice: number | null;
  @ApiProperty({ nullable: true }) orderUuid: string | null;
  @ApiProperty({ nullable: true }) orderNumber: string | null;
  @ApiProperty() createdAt: Date;

  constructor(data: TicketSummaryData) {
    this.id = data.uuid;
    this.ticketNumber = data.ticketNumber;
    this.status = data.status;
    this.qrUrl = data.qrUrl;
    this.pdfUrl = data.pdfUrl;
    this.eventUuid = data.eventUuid;
    this.eventName = data.eventName;
    this.eventDate = data.eventDate;
    this.eventEndDate = data.eventEndDate;
    this.eventBannerUrl = data.eventBannerUrl;
    this.venueName = data.venueName;
    this.venueCity = data.venueCity;
    this.ticketTypeName = data.ticketTypeName;
    this.ticketTypePrice = data.ticketTypePrice;
    this.orderUuid = data.orderUuid;
    this.orderNumber = data.orderNumber;
    this.createdAt = data.createdAt;
  }
}

export class GetMyTicketsResponse {
  @ApiProperty({ type: [TicketSummaryResponse] }) items: TicketSummaryResponse[];
  @ApiProperty({ type: PaginationMetaResponse }) meta: PaginationMetaResponse;

  constructor(items: TicketSummaryResponse[], meta: PaginationMetaResponse) {
    this.items = items;
    this.meta = meta;
  }
}
