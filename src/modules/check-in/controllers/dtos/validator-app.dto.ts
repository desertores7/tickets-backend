import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import {
  IEventCheckInCounter,
  ITicketByDocument,
  IValidatorEvent
} from '../../services/contracts/icheckin.service';

/**
 * Sin constructor: los DTO de request los instancia `plainToInstance` sin
 * argumentos y llena las propiedades por asignacion.
 */
export class FindByDocumentRequest {
  @IsUUID()
  @ApiProperty({ description: 'Evento en el que se busca' })
  eventId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  @ApiProperty({ description: 'Documento del titular. Se normaliza a dígitos.', example: '30123456' })
  document: string;
}

export class ManualCheckInRequest {
  @IsUUID()
  @ApiProperty() ticketUuid: string;

  @IsUUID()
  @ApiProperty() eventId: string;

  @IsOptional()
  @IsObject()
  @ApiPropertyOptional({ description: 'Datos del dispositivo que registra el ingreso' })
  deviceInfo?: Record<string, unknown>;
}

export class ValidatorEventResponse {
  @ApiProperty() uuid: string;
  @ApiProperty() name: string;
  @ApiProperty({ description: 'ISO-8601' }) startDate: string;
  @ApiProperty({ description: 'ISO-8601' }) endDate: string;
  @ApiProperty({ nullable: true }) venueName: string | null;

  @ApiProperty({ description: 'true si la ventana de check-in está abierta ahora' })
  checkInOpen: boolean;

  constructor(data: IValidatorEvent) {
    this.uuid = data.uuid;
    this.name = data.name;
    this.startDate = data.startDate.toISOString();
    this.endDate = data.endDate.toISOString();
    this.venueName = data.venueName;
    this.checkInOpen = data.checkInOpen;
  }
}

export class TicketByDocumentResponse {
  @ApiProperty() ticketUuid: string;
  @ApiProperty() ticketNumber: string;
  @ApiProperty() holderName: string;
  @ApiProperty({ nullable: true }) ticketTypeName: string | null;
  @ApiProperty({ example: 'active' }) status: string;
  @ApiProperty({ nullable: true, description: 'ISO-8601' }) checkedInAt: string | null;

  constructor(data: ITicketByDocument) {
    this.ticketUuid = data.ticketUuid;
    this.ticketNumber = data.ticketNumber;
    this.holderName = data.holderName;
    this.ticketTypeName = data.ticketTypeName ?? null;
    this.status = data.status;
    this.checkedInAt = data.checkedInAt ? new Date(data.checkedInAt).toISOString() : null;
  }
}

export class EventCounterResponse {
  @ApiProperty() eventUuid: string;

  @ApiProperty({ description: 'Ingresos de TODOS los validadores del evento (BR-QR-003)' })
  checkedIn: number;

  @ApiProperty({ description: 'Entradas vigentes del evento' }) totalTickets: number;

  constructor(data: IEventCheckInCounter) {
    this.eventUuid = data.eventUuid;
    this.checkedIn = data.checkedIn;
    this.totalTickets = data.totalTickets;
  }
}
