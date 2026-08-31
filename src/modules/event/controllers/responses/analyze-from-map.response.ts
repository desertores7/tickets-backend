import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  AiEventMapCategory,
  AiEventMapElement,
  AiEventMapStage,
  AiEventMapVenue,
  AnalyzeMapResult
} from '../../services/contracts/ievent-ai.service';

export class AiEventMapVenueResponse implements AiEventMapVenue {
  @ApiProperty({ example: 1000, description: 'Referencia de aspect ratio del canvas' })
  width: number;

  @ApiProperty({ example: 800 })
  height: number;
}

export class AiEventMapStageResponse implements AiEventMapStage {
  @ApiProperty({ enum: ['stage'] })
  id: 'stage';

  @ApiProperty({ example: 'Escenario' })
  label: string;

  @ApiProperty({ description: '0–1' })
  x: number;

  @ApiProperty({ description: '0–1' })
  y: number;

  @ApiProperty({ description: '0–1' })
  width: number;

  @ApiProperty({ description: '0–1' })
  height: number;

  @ApiPropertyOptional()
  rotation?: number;

  @ApiProperty({ description: '0–1; < 0.7 → revisión en frontend' })
  confidence: number;
}

export class AiEventMapCategoryResponse implements AiEventMapCategory {
  @ApiProperty({ example: 'vip-table' })
  id: string;

  @ApiProperty({ example: 'Mesa VIP' })
  label: string;

  @ApiProperty({ nullable: true, example: 100000 })
  detectedPrice: number | null;

  @ApiProperty({ nullable: true })
  detectedCapacity: number | null;

  @ApiProperty({ description: '0–1; < 0.7 → revisión en frontend' })
  confidence: number;
}

export class AiEventMapElementResponse implements AiEventMapElement {
  @ApiProperty({ example: 'm12' })
  id: string;

  @ApiProperty({ example: 'M12' })
  label: string;

  @ApiProperty({ example: 'vip-table' })
  category: string;

  @ApiProperty({ enum: ['circle', 'rectangle', 'polygon'] })
  shape: 'circle' | 'rectangle' | 'polygon';

  @ApiPropertyOptional({ description: '0–1 (circle/rectangle)' })
  x?: number;

  @ApiPropertyOptional({ description: '0–1 (circle/rectangle)' })
  y?: number;

  @ApiPropertyOptional({ description: '0–1 (circle/rectangle)' })
  width?: number;

  @ApiPropertyOptional({ description: '0–1 (circle/rectangle)' })
  height?: number;

  @ApiPropertyOptional({
    description: 'Polígono (≥3 puntos), cada coord 0–1',
    type: 'array',
    items: { type: 'array', items: { type: 'number' } }
  })
  points?: Array<[number, number]>;

  @ApiPropertyOptional()
  rotation?: number;

  @ApiProperty({ nullable: true })
  detectedPrice: number | null;

  @ApiProperty({ nullable: true })
  detectedCapacity: number | null;

  @ApiProperty({ description: '0–1; < 0.7 → revisión en frontend' })
  confidence: number;
}

export class AnalyzeFromMapResponse implements AnalyzeMapResult {
  @ApiProperty({ type: AiEventMapVenueResponse })
  venue: AiEventMapVenueResponse;

  @ApiProperty({ type: AiEventMapStageResponse, nullable: true })
  stage: AiEventMapStageResponse | null;

  @ApiProperty({ type: [AiEventMapCategoryResponse] })
  categories: AiEventMapCategoryResponse[];

  @ApiProperty({ type: [AiEventMapElementResponse] })
  elements: AiEventMapElementResponse[];

  constructor(partial: AnalyzeMapResult) {
    this.venue = partial.venue;
    this.stage = partial.stage;
    this.categories = partial.categories;
    this.elements = partial.elements;
  }
}
