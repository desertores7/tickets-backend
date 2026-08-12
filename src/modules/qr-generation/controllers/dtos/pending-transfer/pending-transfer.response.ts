import { ApiProperty } from '@nestjs/swagger';
import { TicketTransferEntity } from '@config/db/entities/tickets/ticket_transfer.entity';

export class PendingTransferResponse {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'Juan Pérez' }) fromName: string;
  @ApiProperty({ nullable: true }) message: string | null;
  @ApiProperty({ example: 'TKT-20260315-000142' }) ticketNumber: string;
  @ApiProperty({ example: 'Campo General' }) ticketTypeName: string;
  @ApiProperty({ example: 'Lollapalooza 2026' }) eventName: string;
  @ApiProperty() eventDate: Date;
  @ApiProperty({ example: 'Estadio Nacional' }) venueName: string;
  @ApiProperty() createdAt: Date;

  constructor(t: TicketTransferEntity) {
    this.id = t.uuid;
    this.fromName = `${t.fromUser?.firstName ?? ''} ${t.fromUser?.lastName ?? ''}`.trim();
    this.message = t.message;
    this.ticketNumber = t.ticket?.ticketNumber ?? '';
    this.ticketTypeName = (t.ticket as any)?.ticketType?.name ?? 'Entrada';
    this.eventName = t.ticket?.event?.name ?? '';
    this.eventDate = t.ticket?.event?.startDate;
    this.venueName = t.ticket?.event?.venueName ?? '';
    this.createdAt = t.createdAt;
  }
}
