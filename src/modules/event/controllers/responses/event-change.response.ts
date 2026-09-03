import { ApiProperty } from '@nestjs/swagger';
import { EVENT_CHANGE_TYPES, EventChangeType } from '@config/db/entities/tickets/event_change.entity';
import type { TEventChangeItem, TEventChangesResult } from '../../services/implementation/event-change.service';

export class EventChangeFieldResponse {
  @ApiProperty({ example: 'startDate' }) field: string;
  @ApiProperty({ example: 'Inicio' }) label: string;
  @ApiProperty({ nullable: true }) before: string | null;
  @ApiProperty({ nullable: true }) after: string | null;
}

/** Una entrada del historial de cambios del evento (FP10 / `29` §19). */
export class EventChangeResponse {
  @ApiProperty() uuid: string;

  @ApiProperty({ enum: EVENT_CHANGE_TYPES })
  type: EventChangeType;

  @ApiProperty({
    description:
      'Si abre ventana de reembolso cuando hay ventas (BR-REFUND-010). Cambiar la descripción ' +
      'libre no es material; día, horario, venue, lineup y cancelación sí.'
  })
  isMaterial: boolean;

  @ApiProperty({ type: [EventChangeFieldResponse] })
  changes: EventChangeFieldResponse[];

  @ApiProperty({ nullable: true }) reason: string | null;
  @ApiProperty({ nullable: true, description: 'Solo en cambios de stock' })
  ticketTypeUuid: string | null;

  @ApiProperty({
    nullable: true,
    description: 'ISO-8601. Fin de la ventana de reembolso; null si el cambio no abrió ninguna.'
  })
  refundWindowEndsAt: string | null;

  @ApiProperty({ nullable: true, description: 'ISO-8601. Momento del aviso a compradores.' })
  notifiedAt: string | null;

  @ApiProperty({ description: 'A cuántos compradores les llegó el aviso' })
  buyersNotified: number;

  @ApiProperty({ nullable: true }) createdByName: string | null;
  @ApiProperty({ description: 'ISO-8601' }) createdAt: string;

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
    description:
      'ISO-8601. Fin de la ventana de reembolso abierta más lejana, si hay alguna vigente. ' +
      'Null cuando no hay ninguna abierta.'
  })
  openRefundWindowEndsAt: string | null;

  constructor(data: TEventChangesResult) {
    this.items = data.items.map(item => new EventChangeResponse(item));
    this.openRefundWindowEndsAt = data.openRefundWindowEndsAt;
  }
}

export class EventSalesStateResponse {
  @ApiProperty({
    nullable: true,
    description: 'ISO-8601. Momento del corte manual de venta; null si está abierta.'
  })
  salesClosedAt: string | null;

  constructor(salesClosedAt: Date | null) {
    this.salesClosedAt = salesClosedAt ? new Date(salesClosedAt).toISOString() : null;
  }
}
