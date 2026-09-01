import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  AiEventMapCategory,
  AiEventMapCategoryAssignment,
  AiEventMapLayout,
  AiEventMapLayoutGroup,
  AiEventMapStage,
  AnalyzeMapResult,
  MapElementType,
  MapGroupOrdering,
  MapGroupPosition,
  MapLayoutType,
  MapStageAlignment,
  MapStagePosition,
  SaleMode,
  SelectionUnit
} from '../../services/contracts/ievent-ai.service';

const SALE_MODE_ENUM: SaleMode[] = ['whole_unit', 'per_person', 'general_admission'];
const SELECTION_UNIT_ENUM: SelectionUnit[] = [
  'table',
  'seat',
  'box',
  'palco',
  'ticket',
  'section'
];
const ELEMENT_TYPE_ENUM: MapElementType[] = [
  'table',
  'box',
  'palco',
  'seat',
  'zone',
  'section'
];
const STAGE_POSITION_ENUM: MapStagePosition[] = ['top', 'bottom', 'left', 'right'];
const STAGE_ALIGNMENT_ENUM: MapStageAlignment[] = ['start', 'center', 'end'];
const LAYOUT_TYPE_ENUM: MapLayoutType[] = ['column', 'row', 'grid', 'zone', 'freeform'];
const GROUP_POSITION_ENUM: MapGroupPosition[] = [
  'top_left',
  'top_center',
  'top_right',
  'left',
  'center',
  'right',
  'bottom_left',
  'bottom_center',
  'bottom_right'
];
const GROUP_ORDERING_ENUM: MapGroupOrdering[] = [
  'top_to_bottom',
  'bottom_to_top',
  'left_to_right',
  'right_to_left',
  'row_major',
  'column_major'
];

export class AiEventMapStageResponse implements AiEventMapStage {
  @ApiProperty({ description: 'Si el escenario/frente es inferible en el mapa' })
  visible: boolean;

  @ApiProperty({ enum: STAGE_POSITION_ENUM, nullable: true, example: 'top' })
  position: MapStagePosition | null;

  @ApiProperty({ enum: STAGE_ALIGNMENT_ENUM, nullable: true, example: 'center' })
  alignment: MapStageAlignment | null;

  @ApiProperty({
    description:
      'true si el frente se dedujo por orientación en vez de estar dibujado en el flyer'
  })
  inferred: boolean;

  @ApiProperty({ description: '0–1' })
  confidence: number;
}

export class AiEventMapCategoryResponse implements AiEventMapCategory {
  @ApiProperty({ example: 'mesa-vip-chichero' })
  id: string;

  @ApiProperty({ example: 'Mesa VIP Chichero' })
  label: string;

  @ApiProperty({ nullable: true, example: 1000000 })
  detectedPrice: number | null;

  @ApiProperty({ enum: ELEMENT_TYPE_ENUM, example: 'table' })
  elementType: MapElementType;

  @ApiProperty({ enum: SALE_MODE_ENUM, example: 'whole_unit' })
  saleMode: SaleMode;

  @ApiProperty({ enum: SELECTION_UNIT_ENUM, example: 'table' })
  selectionUnit: SelectionUnit;

  @ApiProperty({
    nullable: true,
    example: 10,
    description: 'Capacidad física máxima; null si no visible'
  })
  detectedCapacity: number | null;

  @ApiProperty({
    nullable: true,
    example: 8,
    description: 'Admisiones incluidas al comprar la unidad; distinto de capacity'
  })
  includedAdmissions: number | null;

  @ApiProperty({ description: '0–1' })
  confidence: number;
}

export class AiEventMapCategoryAssignmentResponse implements AiEventMapCategoryAssignment {
  @ApiProperty({ example: 'mesa-vip-chichero', description: 'categories.id' })
  category: string;

  @ApiPropertyOptional({
    nullable: true,
    example: 1,
    description: 'Fila inicial 1-based inclusive. null si el grupo no es grilla'
  })
  rowStart: number | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 2,
    description: 'Fila final 1-based inclusive. null si el grupo no es grilla'
  })
  rowEnd: number | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 1,
    description: 'Columna inicial 1-based inclusive. null si el grupo no es grilla'
  })
  columnStart: number | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 5,
    description: 'Columna final 1-based inclusive. null si el grupo no es grilla'
  })
  columnEnd: number | null;

  @ApiProperty({
    example: 0,
    description:
      'Índice inclusive 0-based en labels[] (inicio). En grillas lo calcula el backend a partir del rectángulo'
  })
  from: number;

  @ApiProperty({
    example: 9,
    description: 'Índice inclusive 0-based en labels[] (fin)'
  })
  to: number;
}

export class AiEventMapLayoutGroupResponse implements AiEventMapLayoutGroup {
  @ApiProperty({ example: 'tables-main' })
  id: string;

  @ApiProperty({ enum: ELEMENT_TYPE_ENUM, example: 'table' })
  elementType: MapElementType;

  @ApiProperty({ enum: LAYOUT_TYPE_ENUM, example: 'grid' })
  layoutType: MapLayoutType;

  @ApiProperty({ enum: GROUP_POSITION_ENUM, example: 'center' })
  position: MapGroupPosition;

  @ApiPropertyOptional({
    nullable: true,
    example: 0,
    description: '0 = más cerca del centro; mayor = más hacia afuera'
  })
  lane: number | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 0,
    description: '0 = arriba en un stack; mayor = más abajo'
  })
  stackOrder: number | null;

  @ApiProperty({ example: 35 })
  count: number;

  @ApiPropertyOptional({ nullable: true, example: 7 })
  rows: number | null;

  @ApiPropertyOptional({ nullable: true, example: 5 })
  columns: number | null;

  @ApiPropertyOptional({
    enum: GROUP_ORDERING_ENUM,
    nullable: true,
    example: 'row_major'
  })
  ordering: MapGroupOrdering | null;

  @ApiProperty({
    type: [String],
    example: ['1', '2', '3'],
    description: 'Labels en orden visual'
  })
  labels: string[];

  @ApiPropertyOptional({
    nullable: true,
    example: null,
    description:
      'Categoría única del grupo; null si el grupo mezcla varias (grilla multicolor)'
  })
  category: string | null;

  @ApiProperty({
    type: [AiEventMapCategoryAssignmentResponse],
    description:
      'Bloques de categoría comercial: rectangulares en grillas, lineales en el resto'
  })
  categoryAssignments: AiEventMapCategoryAssignmentResponse[];

  @ApiProperty({
    description: 'true si este grupo necesita geometría exacta (freeform / irregular)'
  })
  requiresGeometryFallback: boolean;

  @ApiProperty({ description: '0–1' })
  confidence: number;
}

export class AiEventMapLayoutResponse implements AiEventMapLayout {
  @ApiProperty({
    description: 'true si algún grupo requiere análisis geométrico más lento'
  })
  requiresGeometryFallback: boolean;

  @ApiProperty({ type: [AiEventMapLayoutGroupResponse] })
  groups: AiEventMapLayoutGroupResponse[];
}

export class AnalyzeFromMapResponse implements AnalyzeMapResult {
  @ApiProperty({ type: AiEventMapStageResponse })
  stage: AiEventMapStageResponse;

  @ApiProperty({ type: [AiEventMapCategoryResponse] })
  categories: AiEventMapCategoryResponse[];

  @ApiProperty({
    type: AiEventMapLayoutResponse,
    description: 'Estructura física abstracta; categoría por rangos en labels'
  })
  layout: AiEventMapLayoutResponse;

  constructor(partial: AnalyzeMapResult) {
    this.stage = partial.stage;
    this.categories = partial.categories;
    this.layout = partial.layout;
  }
}
