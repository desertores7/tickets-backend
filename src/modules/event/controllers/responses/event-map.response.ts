import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EventMapSectorGeometry } from '@config/db/entities/tickets/event_map_sector.entity';

export class EventMapSectorResponse {
  @ApiProperty() uuid: string;
  @ApiProperty() name: string;
  @ApiProperty() geometry: EventMapSectorGeometry;
  @ApiProperty() sortOrder: number;
  @ApiProperty() isNumbered: boolean;
  @ApiProperty({ nullable: true }) capacity: number | null;
  @ApiProperty({ type: [String] }) ticketTypeUuids: string[];

  constructor(data: {
    uuid: string;
    name: string;
    geometry: EventMapSectorGeometry;
    sortOrder: number;
    isNumbered: boolean;
    capacity: number | null;
    ticketTypeUuids: string[];
  }) {
    this.uuid = data.uuid;
    this.name = data.name;
    this.geometry = data.geometry;
    this.sortOrder = data.sortOrder;
    this.isNumbered = data.isNumbered;
    this.capacity = data.capacity;
    this.ticketTypeUuids = data.ticketTypeUuids;
  }
}

export class EventMapResponse {
  @ApiProperty() uuid: string;
  @ApiProperty() eventUuid: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ nullable: true }) baseImageUrl: string | null;
  @ApiProperty() canvasWidth: number;
  @ApiProperty() canvasHeight: number;
  @ApiProperty({ type: [EventMapSectorResponse] }) sectors: EventMapSectorResponse[];

  constructor(data: {
    uuid: string;
    eventUuid: string;
    name: string;
    baseImageUrl: string | null;
    canvasWidth: number;
    canvasHeight: number;
    sectors: EventMapSectorResponse[];
  }) {
    this.uuid = data.uuid;
    this.eventUuid = data.eventUuid;
    this.name = data.name;
    this.baseImageUrl = data.baseImageUrl;
    this.canvasWidth = data.canvasWidth;
    this.canvasHeight = data.canvasHeight;
    this.sectors = data.sectors;
  }
}
