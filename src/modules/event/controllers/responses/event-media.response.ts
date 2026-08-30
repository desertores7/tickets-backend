import { ApiProperty } from '@nestjs/swagger';
import { EventMediaKind } from '@config/db/entities/tickets/event_media.entity';

export class EventMediaResponse {
  @ApiProperty() uuid: string;
  @ApiProperty() eventUuid: string;
  @ApiProperty() sortOrder: number;
  @ApiProperty({ enum: ['image', 'video'] }) kind: EventMediaKind;
  @ApiProperty() url: string;
  @ApiProperty() mimeType: string;
  @ApiProperty() createdAt: Date;

  constructor(data: {
    uuid: string;
    eventUuid: string;
    sortOrder: number;
    kind: EventMediaKind;
    url: string;
    mimeType: string;
    createdAt: Date;
  }) {
    this.uuid = data.uuid;
    this.eventUuid = data.eventUuid;
    this.sortOrder = data.sortOrder;
    this.kind = data.kind;
    this.url = data.url;
    this.mimeType = data.mimeType;
    this.createdAt = data.createdAt;
  }
}
