import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CheckInResultData, CheckInTicket } from '../../services/core/checkin';

class CheckInTicketResponse {
  @ApiProperty() uuid: string;
  @ApiProperty() ticketNumber: string;
  @ApiProperty() eventUuid: string;
  @ApiProperty() userUuid: string;
  @ApiProperty() status: string;
  @ApiPropertyOptional({ nullable: true }) checkedInAt: Date | null;
  @ApiPropertyOptional({ nullable: true }) checkedInBy: string | null;

  constructor(t: CheckInTicket) {
    this.uuid = t.uuid;
    this.ticketNumber = t.ticketNumber;
    this.eventUuid = t.eventUuid;
    this.userUuid = t.userUuid;
    this.status = t.status;
    this.checkedInAt = t.checkedInAt;
    this.checkedInBy = t.checkedInBy;
  }
}

export class ValidateQrResponse {
  @ApiProperty() success: boolean;
  @ApiProperty({ description: 'Mensaje descriptivo del resultado' }) message: string;
  @ApiProperty({
    description: 'Resultado del intento de check-in',
    enum: ['success', 'already_used', 'invalid', 'wrong_event']
  })
  result: string;

  @ApiPropertyOptional({ type: CheckInTicketResponse, nullable: true })
  ticket?: CheckInTicketResponse;

  constructor(data: CheckInResultData) {
    this.success = data.success;
    this.message = data.message;
    this.result = data.result;
    if (data.ticket) this.ticket = new CheckInTicketResponse(data.ticket);
  }
}
