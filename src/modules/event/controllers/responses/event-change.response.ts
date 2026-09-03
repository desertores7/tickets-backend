import { ApiProperty } from '@nestjs/swagger';
import { EVENT_CHANGE_TYPES, EventChangeType } from '@config/db/entities/tickets/event_change.entity';
import type { TEventChangeItem, TEventChangesResult } from '../../services/implementation/event-change.service';

export class EventChangeFieldResponse {
  @ApiProperty() field: string;
  @ApiProperty() label: string;
  @ApiProperty({ nullable: true }) before: string | null;
  @ApiProperty({ nullable: true }) after: string | null;
}

export class EventChangeResponse {
  @ApiProperty() uuid: string;
  @ApiProperty({ enum: EVENT_CHANGE_TYPES }) type: EventChangeType;
  @ApiProperty({ description: 'Si abre ventana de reembolso cuando hay ventas (BR-REFUND-010)' })
  isMaterial: boolean;
  @ApiProperty({ type: [EventChangeFieldResponse] }) changes: EventChangeFieldResponse[];
  @ApiProperty({ nullable: true }) reason: string | null;
  @ApiProperty({ nullable: true }) ticketTypeUuid: string | null;
  @ApiProperty({ nullable: true }) refundWindowEndsAt: string | null;
  @ApiProperty({ nullable: true }) notifiedAt: string | null;
  @ApiProperty() buyersNotified: number;
  @ApiProperty({ nullable: true }) createdByName: string | null;
  @ApiProperty() createdAt: string;

  constructor(data: TEventChangeItem) {
    this.uuid = data.uuid;
    this.type = data.type;
    this.isMaterial = data.isMaterial;
    this.changes = data.changes;
    this.reason = data.reason;
    this.ticketTypeUuid = data.ticketTypeUuid;
    this.refundWindowEndsAt = data.refundWindowEndsAt;
    this.notifiedAt = data.notifiedAt;
    this.buyersNotified = data.buyersNotified;
    this.createdByName = data.createdByName;
    this.createdAt = data.createdAt;
  }
}

export class EventChangesResponse {
  @ApiProperty({ type: [EventChangeResponse] }) items: EventChangeResponse[];
  @ApiProperty({
    nullable: true,
    description: 'Fin de la ventana de reembolso abierta más lejana; null si no hay ninguna'
  })
  openRefundWindowEndsAt: string | null;

  constructor(data: TEventChangesResult) {
    this.items = data.items.map(item => new EventChangeResponse(item));
    this.openRefundWindowEndsAt = data.openRefundWindowEndsAt;
  }
}
