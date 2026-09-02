import { ApiProperty } from '@nestjs/swagger';
import {
  EVENT_CHANGE_TYPES,
  EventChangeField,
  EventChangeType
} from '@config/db/entities/tickets/event_change.entity';
import { TEventChange } from '../../services/contracts/ievent.service';

export class EventChangeFieldResponse {
  @ApiProperty({ example: 'startDate' }) field: string;
  @ApiProperty({ example: 'Inicio' }) label: string;
  @ApiProperty({ nullable: true }) before: string | null;
  @ApiProperty({ nullable: true }) after: string | null;

  constructor(data: EventChangeField) {
    this.field = data.field;
    this.label = data.label;
    this.before = data.before;
    this.after = data.after;
  }
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

  constructor(data: TEventChange) {
    this.uuid = data.uuid;
    this.type = data.type;
    this.isMaterial = data.isMaterial;
    this.changes = data.changes.map(c => new EventChangeFieldResponse(c));
    this.reason = data.reason;
    this.ticketTypeUuid = data.ticketTypeUuid;
    this.refundWindowEndsAt = data.refundWindowEndsAt
      ? new Date(data.refundWindowEndsAt).toISOString()
      : null;
    this.notifiedAt = data.notifiedAt ? new Date(data.notifiedAt).toISOString() : null;
    this.buyersNotified = data.buyersNotified;
    this.createdByName = data.createdByName;
    this.createdAt = new Date(data.createdAt).toISOString();
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

  constructor(items: EventChangeResponse[]) {
    this.items = items;

    // La ventana vigente es la que más tarde vence: dos cambios materiales
    // seguidos no acortan el plazo que ya se le comunicó al comprador.
    const now = Date.now();
    const open = items
      .map(i => i.refundWindowEndsAt)
      .filter((d): d is string => Boolean(d) && new Date(d as string).getTime() > now)
      .sort();

    this.openRefundWindowEndsAt = open.length ? open[open.length - 1] : null;
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
