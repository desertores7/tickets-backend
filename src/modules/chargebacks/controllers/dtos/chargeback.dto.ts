import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { TChargebackItem } from '../../services/implementation/chargeback.service';

export class UpdateChargebackNotesRequest {
  @ApiPropertyOptional({
    description: 'Notas internas del equipo. Vacío las borra.',
    maxLength: 4000
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  internalNotes?: string;
}

export class ChargebackResponse {
  @ApiProperty() uuid: string;
  @ApiProperty() mpChargebackId: string;
  @ApiProperty({ nullable: true }) mpPaymentId: string | null;
  @ApiProperty({ nullable: true }) orderUuid: string | null;
  @ApiProperty({ nullable: true }) orderNumber: string | null;
  @ApiProperty({ nullable: true }) eventUuid: string | null;
  @ApiProperty({ nullable: true }) eventName: string | null;
  @ApiProperty({ nullable: true }) buyerName: string | null;
  @ApiProperty({ nullable: true }) buyerEmail: string | null;
  @ApiProperty() amount: number;
  @ApiProperty() currency: string;
  @ApiProperty({ description: 'Estado que reporta Mercado Pago.' }) status: string;
  @ApiProperty() documentationRequired: boolean;
  @ApiProperty({ nullable: true }) documentationStatus: string | null;
  @ApiProperty({ nullable: true, description: 'Hasta cuándo se puede responder.' })
  documentationDeadline: string | null;
  @ApiProperty({ description: 'Mercado Pago cubre el monto.' }) coverageApplied: boolean;
  @ApiProperty({ nullable: true }) internalNotes: string | null;
  @ApiProperty({
    description: 'Historial de envíos de evidencia a MP, más reciente al final.',
    type: 'array',
    items: { type: 'object' }
  })
  evidenceSubmissions: Record<string, unknown>[];
  @ApiProperty({ nullable: true }) receivedAt: string | null;
  @ApiProperty({ nullable: true }) closedAt: string | null;

  constructor(data: TChargebackItem) {
    Object.assign(this, data);
  }
}

export class GetChargebacksResponse {
  @ApiProperty({ type: PaginationMetaResponse }) meta: PaginationMetaResponse;
  @ApiProperty({ type: [ChargebackResponse] }) items: ChargebackResponse[];
  @ApiProperty({ description: 'Contracargos todavía abiertos, sobre el total.' }) openCount: number;

  constructor(data: { meta: PaginationMetaResponse; items: TChargebackItem[]; openCount: number }) {
    this.meta = data.meta;
    this.items = data.items.map(item => new ChargebackResponse(item));
    this.openCount = data.openCount;
  }
}
