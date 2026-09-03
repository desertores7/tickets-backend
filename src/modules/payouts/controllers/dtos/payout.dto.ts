import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { PAYOUT_STATUSES, PayoutStatus } from '@config/db/entities/tickets/payout.entity';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { IPayout, IPayoutEventBlock } from '../../services/contracts/ipayout.service';

/** Sin constructor: `plainToInstance` instancia los request sin argumentos. */
export class CreatePayoutRequest {
  @IsUUID()
  @ApiProperty({ description: 'Evento liquidado. Exactamente uno (BR-PAY-005).' })
  eventUuid: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @ApiProperty({ description: 'Monto transferido, SIN costo de servicio', example: 486000 })
  amount: number;

  @IsISO8601()
  @ApiProperty({ description: 'Fecha de la transferencia, ISO-8601' })
  transferredAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @ApiPropertyOptional()
  notes?: string;
}

export class PayoutResponse {
  @ApiProperty() uuid: string;
  @ApiProperty() eventUuid: string;
  @ApiProperty() eventName: string;

  @ApiProperty({ description: 'SIN costo de servicio (BR-REPORT-001)' })
  amount: number;

  @ApiProperty({ description: 'ISO-8601' }) transferredAt: string;
  @ApiProperty({ nullable: true }) notes: string | null;
  @ApiProperty({ enum: PAYOUT_STATUSES }) status: PayoutStatus;
  @ApiProperty() hasTransferProof: boolean;
  @ApiProperty() hasArcaInvoice: boolean;
  @ApiProperty({ description: 'ISO-8601' }) createdAt: string;

  constructor(data: IPayout) {
    this.uuid = data.uuid;
    this.eventUuid = data.eventUuid;
    this.eventName = data.eventName;
    this.amount = data.amount;
    this.transferredAt = new Date(data.transferredAt).toISOString();
    this.notes = data.notes;
    this.status = data.status;
    this.hasTransferProof = data.hasTransferProof;
    this.hasArcaInvoice = data.hasArcaInvoice;
    this.createdAt = new Date(data.createdAt).toISOString();
  }
}

/** Bloque por evento: es la forma que pide la UI (`29` §8). */
export class PayoutEventBlockResponse {
  @ApiProperty() eventUuid: string;
  @ApiProperty() eventName: string;
  @ApiProperty({ nullable: true, description: 'ISO-8601' }) eventStartDate: string | null;
  @ApiProperty({ description: 'Suma de las liquidaciones del evento' }) totalAmount: number;
  @ApiProperty({ type: [PayoutResponse] }) payouts: PayoutResponse[];

  constructor(data: IPayoutEventBlock) {
    this.eventUuid = data.eventUuid;
    this.eventName = data.eventName;
    this.eventStartDate = data.eventStartDate
      ? new Date(data.eventStartDate).toISOString()
      : null;
    this.totalAmount = data.totalAmount;
    this.payouts = data.payouts.map(p => new PayoutResponse(p));
  }
}

export class PayoutBlocksResponse {
  @ApiProperty({ type: [PayoutEventBlockResponse] }) items: PayoutEventBlockResponse[];
  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        eventUuid: { type: 'string' },
        eventName: { type: 'string' }
      }
    }
  })
  eventOptions: { eventUuid: string; eventName: string }[];

  @ApiPropertyOptional({ type: PaginationMetaResponse })
  meta?: PaginationMetaResponse;

  constructor(
    items: PayoutEventBlockResponse[],
    eventOptions: { eventUuid: string; eventName: string }[] = [],
    meta?: PaginationMetaResponse
  ) {
    this.items = items;
    this.eventOptions = eventOptions;
    this.meta = meta;
  }
}
