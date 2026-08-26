import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SuggestMapSectorItem {
  @ApiProperty() name: string;
  @ApiProperty() x: number;
  @ApiProperty() y: number;
  @ApiProperty() w: number;
  @ApiProperty() h: number;
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
