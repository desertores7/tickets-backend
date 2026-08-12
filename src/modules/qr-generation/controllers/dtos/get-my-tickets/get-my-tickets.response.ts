import { ApiProperty } from '@nestjs/swagger';
import { TicketStatus } from '@config/db/entities/tickets/ticket.entity';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';

export interface TicketSummaryData {
  uuid: string;
  ticketNumber: string;
  status: TicketStatus;
  qrUrl: string | null;
  pdfUrl: string | null;
  eventName: string;
  eventDate: Date;
  venueName: string;
  ticketTypeName: string;
  /** Transferencia pendiente de confirmación, si la hay */
  pendingTransfer: { id: string; toEmail: string } | null;
  createdAt: Date;
}

export class TicketSummaryResponse {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }) id: string;
  @ApiProperty({ example: 'TKT-20250315-000142' }) ticketNumber: string;
  @ApiProperty({ enum: TicketStatus, example: TicketStatus.ACTIVE }) status: TicketStatus;
  @ApiProperty({ nullable: true, example: 'https://api.example.com/static/tickets/qr/uuid.png' }) qrUrl: string | null;
  @ApiProperty({ nullable: true, example: 'https://api.example.com/static/tickets/pdf/uuid.pdf' }) pdfUrl: string | null;
  @ApiProperty({ example: 'Lollapalooza Argentina 2025' }) eventName: string;
  @ApiProperty() eventDate: Date;
  @ApiProperty({ example: 'Hipódromo de San Isidro' }) venueName: string;
  @ApiProperty({ example: 'Campo General' }) ticketTypeName: string;
  @ApiProperty({
    nullable: true,
    description: 'Transferencia esperando confirmación del destinatario.',
    example: { id: 'a1b2…', toEmail: 'amigo@ejemplo.com' }
  })
  pendingTransfer: { id: string; toEmail: string } | null;
  @ApiProperty() createdAt: Date;

  constructor(data: TicketSummaryData) {
    this.id = data.uuid;
    this.ticketNumber = data.ticketNumber;
    this.status = data.status;
    this.qrUrl = data.qrUrl;
    this.pdfUrl = data.pdfUrl;
    this.eventName = data.eventName;
    this.eventDate = data.eventDate;
    this.venueName = data.venueName;
    this.ticketTypeName = data.ticketTypeName;
    this.pendingTransfer = data.pendingTransfer;
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
