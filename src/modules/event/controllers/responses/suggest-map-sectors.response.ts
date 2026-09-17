import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { MapSectorLayout } from '@modules/event/services/core/map-grid';
import { MapSectorLayoutDto } from '../requests/upsert-event-map.request';

export class SuggestMapSectorItem {
  @ApiProperty() name: string;
  @ApiProperty({ type: MapSectorLayoutDto, description: 'Celdas en la grilla 24×24' })
  layout: MapSectorLayout;
  @ApiProperty({ deprecated: true, description: 'Derivado de layout (0..1)' }) x: number;
  @ApiProperty({ deprecated: true }) y: number;
  @ApiProperty({ deprecated: true }) w: number;
  @ApiProperty({ deprecated: true }) h: number;
  @ApiPropertyOptional() color?: string;
  @ApiProperty({ type: [String] }) ticketTypeUuids: string[];
}

export class SuggestMapSectorsResponse {
  @ApiProperty({ type: [SuggestMapSectorItem] })
  sectors: SuggestMapSectorItem[];

  @ApiPropertyOptional({ nullable: true })
  warning: string | null;

  constructor(sectors: SuggestMapSectorItem[], warning: string | null = null) {
    this.sectors = sectors;
    this.warning = warning;
  }
}
