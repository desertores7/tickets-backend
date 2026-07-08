import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TicketStatus } from '@config/db/entities/tickets/ticket.entity';

export interface GetTicketEventData {
  uuid: string;
  name: string;
  startDate: Date;
  venueName: string;
  venueCity: string;
}

export interface GetTicketTypeData {
  uuid: string;
  name: string;
  price: number;
}

export interface GetTicketOrderData {
  uuid: string;
  orderNumber: string;
}

export interface GetTicketData {
  uuid: string;
  ticketNumber: string;
  status: TicketStatus;
  qrUrl: string | null;
  pdfUrl: string | null;
  qrCode: string | null;
  checkedInAt: Date | null;
  event: GetTicketEventData;
  ticketType: GetTicketTypeData;
  order: GetTicketOrderData;
  createdAt: Date;
}

class TicketEventResponse {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }) id: string;
  @ApiProperty({ example: 'Lollapalooza Argentina 2025' }) name: string;
  @ApiProperty() startDate: Date;
  @ApiProperty({ example: 'Hipódromo de San Isidro' }) venueName: string;
  @ApiProperty({ example: 'Buenos Aires' }) venueCity: string;

  constructor(data: GetTicketEventData) {
    this.id = data.uuid;
    this.name = data.name;
    this.startDate = data.startDate;
    this.venueName = data.venueName;
    this.venueCity = data.venueCity;
  }
}

class TicketTypeResponse {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }) id: string;
  @ApiProperty({ example: 'Campo General' }) name: string;
  @ApiProperty({ example: 12500.0 }) price: number;

  constructor(data: GetTicketTypeData) {
    this.id = data.uuid;
    this.name = data.name;
    this.price = Number(data.price);
  }
}

class TicketOrderResponse {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }) id: string;
  @ApiProperty({ example: 'ORD-20250315-0001' }) orderNumber: string;

  constructor(data: GetTicketOrderData) {
    this.id = data.uuid;
    this.orderNumber = data.orderNumber;
  }
}

export class GetTicketResponse {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }) id: string;
  @ApiProperty({ example: 'TKT-20250315-000142' }) ticketNumber: string;
  @ApiProperty({ enum: TicketStatus, example: TicketStatus.ACTIVE }) status: TicketStatus;
  @ApiProperty({ nullable: true, example: 'https://api.example.com/static/tickets/qr/uuid.png' }) qrUrl: string | null;
  @ApiProperty({ nullable: true, example: 'https://api.example.com/static/tickets/pdf/uuid.pdf' }) pdfUrl: string | null;
  @ApiProperty({ nullable: true, description: 'Token QR firmado con HMAC-SHA256 (base64url.base64url)' }) qrCode: string | null;
  @ApiPropertyOptional({ nullable: true }) checkedInAt: Date | null;
  @ApiProperty({ type: TicketEventResponse }) event: TicketEventResponse;
  @ApiProperty({ type: TicketTypeResponse }) ticketType: TicketTypeResponse;
  @ApiProperty({ type: TicketOrderResponse }) order: TicketOrderResponse;
  @ApiProperty() createdAt: Date;

  constructor(data: GetTicketData) {
    this.id = data.uuid;
    this.ticketNumber = data.ticketNumber;
    this.status = data.status;
    this.qrUrl = data.qrUrl;
    this.pdfUrl = data.pdfUrl;
    this.qrCode = data.qrCode;
    this.checkedInAt = data.checkedInAt;
    this.event = new TicketEventResponse(data.event);
    this.ticketType = new TicketTypeResponse(data.ticketType);
    this.order = new TicketOrderResponse(data.order);
    this.createdAt = data.createdAt;
  }
}
