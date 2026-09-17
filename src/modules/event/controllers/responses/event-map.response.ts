import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GridAnalysisResponse } from './analyze-from-map.response';
import type { GridAnalysis } from '@modules/event/services/core/map-grid-analysis';
import { TicketTypeResponse } from './ticket-type.response';
import type { TEventMap } from '@modules/event/services/contracts/ievent.service';
import type { MapSectorLayout } from '@modules/event/services/core/map-grid';
import { MapSectorLayoutDto } from '../requests/upsert-event-map.request';

export class MapGridSizeResponse {
  @ApiProperty({ example: 24 }) cols: number;
  @ApiProperty({ example: 24 }) rows: number;
}

export class EventMapSectorResponse {
  @ApiProperty() uuid: string;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true, description: 'Piso impreso; null en salas de un nivel.' })
  level: string | null;
  @ApiProperty({
    type: MapSectorLayoutDto,
    nullable: true,
    description: 'Celdas del sector en la grilla 24×24 (fuente de verdad).'
  })
  layout: MapSectorLayout | null;
  @ApiProperty({ nullable: true }) color: string | null;
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
    layout: MapSectorLayout | null;
    color: string | null;
    sortOrder: number;
    isNumbered: boolean;
    capacity: number | null;
    ticketTypeUuids: string[];
    activeTicketTypeUuid: string | null;
  }) {
    this.uuid = data.uuid;
    this.name = data.name;
    this.level = data.level;
    this.layout = data.layout;
    this.color = data.color;
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

  @ApiPropertyOptional({
    type: GridAnalysisResponse,
    nullable: true,
    description:
      'Análisis en celdas para el editor de grilla (sin box/outline/pesos). ' +
      'El escenario está en `stageLayout`. Null si no hay.'
  })
  analysis: GridAnalysis | null;
  @ApiProperty({ type: MapGridSizeResponse, description: 'Grilla fija 24×24, índices 1-based.' })
  grid: MapGridSizeResponse;
  @ApiProperty({ type: MapSectorLayoutDto, description: 'Celdas del escenario.' })
  stageLayout: MapSectorLayout;
  @ApiProperty({
    description: 'true si la migración a grilla dejó solapes sin resolver: re-analizar o re-editar.'
  })
  needsReanalysis: boolean;
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

    this.analysis = data.analysis ?? null;
    this.grid = data.grid;
    this.stageLayout = data.stageLayout;
    this.needsReanalysis = data.needsReanalysis;
    this.sectors = data.sectors.map(s => new EventMapSectorResponse(s));
    this.ticketTypes = (data.ticketTypes ?? []).map(tt => new TicketTypeResponse(tt));
  }
}
