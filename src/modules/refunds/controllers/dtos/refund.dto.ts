import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsIn, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import {
  REFUND_REQUEST_STATUSES,
  RefundRequestStatus
} from '@config/db/entities/tickets/refund_request.entity';
import {
  TRefundEligibility,
  TRefundRequest,
  TRefundableTicket
} from '../../services/contracts/irefund.service';

/** Sin constructor: `plainToInstance` instancia los request sin argumentos. */
export class CreateRefundRequest {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  @ApiProperty({
    type: [String],
    description:
      'Entradas a reembolsar. Puede ser una parte de la orden: la unidad del reembolso es el ' +
      'ticket, no la compra (BR-REFUND-009).'
  })
  ticketUuids: string[];
}

export class RefundFiltersQuery {
  @IsOptional()
  @IsUUID()
  @ApiPropertyOptional({ description: 'Filtrar por evento' })
  eventUuid?: string;

  @IsOptional()
  @IsIn([...REFUND_REQUEST_STATUSES])
  @ApiPropertyOptional({ enum: REFUND_REQUEST_STATUSES })
  status?: RefundRequestStatus;

  @IsOptional()
  @IsISO8601()
  @ApiPropertyOptional({ description: 'Fecha de solicitud desde. YYYY-MM-DD' })
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  @ApiPropertyOptional({ description: 'Fecha de solicitud hasta. YYYY-MM-DD' })
  dateTo?: string;
}

export class RefundableTicketResponse {
  @ApiProperty() ticketUuid: string;
  @ApiProperty() ticketNumber: string;
  @ApiProperty() ticketTypeName: string;

  @ApiProperty({ description: 'Valor de la entrada, SIN costo de servicio (BR-REFUND-006)' })
  amount: number;

  @ApiProperty({
    nullable: true,
    description: 'Por qué no se puede pedir esta entrada. Null = disponible.',
    example: 'Ya se usó para entrar'
  })
  blockedReason: string | null;

  constructor(data: TRefundableTicket) {
    this.ticketUuid = data.ticketUuid;
    this.ticketNumber = data.ticketNumber;
    this.ticketTypeName = data.ticketTypeName;
    this.amount = data.amount;
    this.blockedReason = data.blockedReason;
  }
}

export class RefundEligibilityResponse {
  @ApiProperty() orderUuid: string;
  @ApiProperty() eventUuid: string;
  @ApiProperty() eventName: string;

  @ApiProperty({ description: 'Si hoy se puede pedir el reembolso de esta orden' })
  canRequest: boolean;

  @ApiProperty({ nullable: true, description: 'Por qué no se puede, cuando canRequest es false' })
  reason: string | null;

  @ApiProperty({
    nullable: true,
    description:
      'ISO-8601. Hasta cuándo se puede pedir: por defecto el inicio del evento, o la fecha que ' +
      'haya extendido un Administrador (BR-REFUND-010).'
  })
  windowEndsAt: string | null;

  @ApiProperty({ type: [RefundableTicketResponse] })
  tickets: RefundableTicketResponse[];

  @ApiProperty({ example: 'ARS' }) currency: string;

  constructor(data: TRefundEligibility) {
    this.orderUuid = data.orderUuid;
    this.eventUuid = data.eventUuid;
    this.eventName = data.eventName;
    this.canRequest = data.canRequest;
    this.reason = data.reason;
    this.windowEndsAt = data.windowEndsAt ? new Date(data.windowEndsAt).toISOString() : null;
    this.tickets = data.tickets.map(t => new RefundableTicketResponse(t));
    this.currency = data.currency;
  }
}

export class RefundRequestTicketResponse {
  @ApiProperty() ticketUuid: string;
  @ApiProperty() ticketNumber: string;
  @ApiProperty() amount: number;
}

export class RefundRequestResponse {
  @ApiProperty() uuid: string;
  @ApiProperty() orderUuid: string;
  @ApiProperty({ example: 'ORD-20260828-000142' }) orderNumber: string;
  @ApiProperty() eventUuid: string;
  @ApiProperty() eventName: string;

  @ApiProperty({ description: 'Comprador. Solo se expone al Productor y al Admin.' })
  buyerName: string;

  @ApiProperty() buyerEmail: string;

  @ApiProperty({
    enum: REFUND_REQUEST_STATUSES,
    description:
      '`approved` es "la validamos"; `refunded` es "la plata volvió". `failed` necesita acción ' +
      'manual del Admin y nunca se reintenta solo (BR-REFUND-011).'
  })
  status: RefundRequestStatus;

  @ApiProperty({ description: 'Suma de las entradas incluidas, sin costo de servicio' })
  amount: number;

  @ApiProperty({ example: 'ARS' }) currency: string;

  @ApiProperty({ nullable: true, description: 'Motivo del rechazo o del fallo' })
  resolutionReason: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Número del procesador de Mercado Pago: es con el que se le reclama'
  })
  uniqueSequenceNumber: string | null;

  @ApiProperty({ nullable: true, description: 'Lo que MP dice que volvió al comprador' })
  amountRefundedToPayer: number | null;

  @ApiProperty({ description: 'ISO-8601' }) requestedAt: string;
  @ApiProperty({ nullable: true, description: 'ISO-8601' }) resolvedAt: string | null;

  @ApiProperty({ type: [RefundRequestTicketResponse] })
  tickets: RefundRequestTicketResponse[];

  constructor(data: TRefundRequest) {
    this.uuid = data.uuid;
    this.orderUuid = data.orderUuid;
    this.orderNumber = data.orderNumber;
    this.eventUuid = data.eventUuid;
    this.eventName = data.eventName;
    this.buyerName = data.buyerName;
    this.buyerEmail = data.buyerEmail;
    this.status = data.status;
    this.amount = data.amount;
    this.currency = data.currency;
    this.resolutionReason = data.resolutionReason;
    this.uniqueSequenceNumber = data.uniqueSequenceNumber;
    this.amountRefundedToPayer = data.amountRefundedToPayer;
    this.requestedAt = new Date(data.requestedAt).toISOString();
    this.resolvedAt = data.resolvedAt ? new Date(data.resolvedAt).toISOString() : null;
    this.tickets = data.tickets.map(t => ({
      ticketUuid: t.ticketUuid,
      ticketNumber: t.ticketNumber,
      amount: t.amount
    }));
  }
}

export class RefundRequestsResponse {
  @ApiProperty({ type: [RefundRequestResponse] }) items: RefundRequestResponse[];

  @ApiProperty({ description: 'Suma de las solicitudes listadas' })
  total: number;

  @ApiProperty({ description: 'Cuántas están esperando resolución' })
  pending: number;

  constructor(items: RefundRequestResponse[]) {
    this.items = items;
    this.total = Math.round(items.reduce((sum, i) => sum + i.amount, 0) * 100) / 100;
    this.pending = items.filter(i =>
      ['pending', 'approved', 'processing'].includes(i.status)
    ).length;
  }
}
