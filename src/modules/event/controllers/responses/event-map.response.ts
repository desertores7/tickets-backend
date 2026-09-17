import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EventMapSectorGeometry } from '@config/db/entities/tickets/event_map_sector.entity';
import { TicketTypeResponse } from './ticket-type.response';
import type { TEventMap } from '@modules/event/services/contracts/ievent.service';

export class EventMapSectorResponse {
  @ApiProperty() uuid: string;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true, description: 'Piso impreso; null en salas de un nivel.' })
  level: string | null;
  @ApiProperty() geometry: EventMapSectorGeometry;
  @ApiProperty() sortOrder: number;
  @ApiProperty() isNumbered: boolean;
  @ApiProperty({ nullable: true }) capacity: number | null;
  @ApiProperty({ type: [String] }) ticketTypeUuids: string[];
  @ApiProperty({
    nullable: true,
    description: 'UUID de la única tanda comprable actualmente en este sector.'
  })
  activeTicketTypeUuid: string | null;

  constructor(data: {
    uuid: string;
    name: string;
    level: string | null;
    geometry: EventMapSectorGeometry;
    sortOrder: number;
    isNumbered: boolean;
    capacity: number | null;
    ticketTypeUuids: string[];
    activeTicketTypeUuid: string | null;
  }) {
    this.uuid = data.uuid;
    this.name = data.name;
    this.level = data.level;
    this.geometry = data.geometry;
    this.sortOrder = data.sortOrder;
    this.isNumbered = data.isNumbered;
    this.capacity = data.capacity;
    this.ticketTypeUuids = data.ticketTypeUuids;
    this.activeTicketTypeUuid = data.activeTicketTypeUuid;
  }
}

export class TicketTypeMapSectorsResponse {
  @ApiProperty() ticketTypeUuid: string;
  @ApiProperty({ type: [String] }) sectorUuids: string[];

  constructor(data: { ticketTypeUuid: string; sectorUuids: string[] }) {
    this.ticketTypeUuid = data.ticketTypeUuid;
    this.sectorUuids = data.sectorUuids;
  }
}

export class EventMapResponse {
  @ApiProperty({
    nullable: true,
    description: 'Null si el evento todavía no tiene mapa de sala configurado.'
  })
  uuid: string | null;

  @ApiProperty() eventUuid: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ nullable: true }) baseImageUrl: string | null;
  @ApiProperty() canvasWidth: number;
  @ApiProperty() canvasHeight: number;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Layout abstracto de la IA para MapGridOverlay; null si no hay.'
  })
  analysis: Record<string, unknown> | null;
  @ApiProperty({ type: [EventMapSectorResponse] }) sectors: EventMapSectorResponse[];
  @ApiProperty({
    type: [TicketTypeResponse],
    description: 'Tandas del evento (precios/stock). Van con el mapa para la compra por sector.'
  })
  ticketTypes: TicketTypeResponse[];

  constructor(data: TEventMap) {
    this.uuid = data.uuid;
    this.eventUuid = data.eventUuid;
    this.name = data.name;
    this.baseImageUrl = data.baseImageUrl;
    this.canvasWidth = data.canvasWidth;
    this.canvasHeight = data.canvasHeight;
    this.analysis = data.analysis ?? null;
    this.sectors = data.sectors.map(s => new EventMapSectorResponse(s));
    this.ticketTypes = (data.ticketTypes ?? []).map(tt => new TicketTypeResponse(tt));
  }
}
