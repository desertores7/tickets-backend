import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  AnalyzeMapResult,
  MapReplicateSector,
  MapReplicateTicketType
} from '../../services/contracts/ievent-ai.service';

export class MapReplicateTicketTypeResponse implements MapReplicateTicketType {
  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty()
  price: number;

  @ApiProperty()
  quantity: number;

  @ApiPropertyOptional()
  color?: string;
}

export class MapReplicateSectorResponse implements MapReplicateSector {
  @ApiProperty()
  name: string;

  @ApiProperty({ enum: ['rect', 'ellipse'] })
  shape: 'rect' | 'ellipse';

  @ApiProperty()
  x: number;

  @ApiProperty()
  y: number;

  @ApiProperty()
  w: number;

  @ApiProperty()
  h: number;

  @ApiPropertyOptional()
  color?: string;

  @ApiProperty()
  ticketTypeName: string;

  @ApiProperty()
  sellable: boolean;
}

export class AnalyzeFromMapResponse implements AnalyzeMapResult {
  @ApiProperty({ type: [MapReplicateTicketTypeResponse] })
  ticketTypes: MapReplicateTicketTypeResponse[];

  @ApiProperty({ type: [MapReplicateSectorResponse] })
  sectors: MapReplicateSectorResponse[];

  @ApiProperty({ nullable: true })
  warning: string | null;

  constructor(partial: AnalyzeMapResult) {
    this.ticketTypes = partial.ticketTypes;
    this.sectors = partial.sectors;
    this.warning = partial.warning;
  }
}
