import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  AiEventMapArea,
  AiEventMapCategory,
  AiEventMapCategoryAssignment,
  AiEventMapCell,
  AiEventMapLayout,
  AiEventMapLayoutGroup,
  AiEventMapPoint,
  AiEventMapStage,
  AnalyzeMapResult,
  MapContainedAt,
  MapElementType,
  MapGroupOrdering,
  MapGroupPosition,
  MapLabelOrientation,
  MapLayoutType,
  MapShapeKind,
  MapShapeNotch,
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
const STAGE_POSITION_ENUM: MapStagePosition[] = ['top', 'bottom', 'left', 'right', 'center'];
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
const SHAPE_ENUM: MapShapeKind[] = ['rect', 'l', 'u', 'ring', 'trapezoid', 'corner_cut'];
const LABEL_ORIENTATION_ENUM: MapLabelOrientation[] = ['horizontal', 'vertical'];
const SHAPE_NOTCH_ENUM: MapShapeNotch[] = [
  'top',
  'bottom',
  'left',
  'right',
  'top_left',
  'top_right',
  'bottom_left',
  'bottom_right'
];
const CONTAINED_AT_ENUM: MapContainedAt[] = [
  'top',
  'top_left',
  'top_right',
  'center',
  'bottom',
  'bottom_left',
  'bottom_right'
];

export class AiEventMapPointResponse implements AiEventMapPoint {
  @ApiProperty({ example: 0.1 })
  x: number;

  @ApiProperty({ example: 0.2 })
  y: number;
}

export class AiEventMapAreaResponse implements AiEventMapArea {
  @ApiProperty({ example: 0.1 })
  x: number;

  @ApiProperty({ example: 0.2 })
  y: number;

  @ApiProperty({ example: 0.6 })
  w: number;

  @ApiProperty({ example: 0.5 })
  h: number;

  @ApiProperty({ example: 0.9 })
  confidence: number;
}

export class AiEventMapCellResponse implements AiEventMapCell {
  @ApiProperty({ example: 1 })
  col: number;

  @ApiProperty({ example: 1 })
  row: number;

  @ApiProperty({ example: 4 })
  colSpan: number;

  @ApiProperty({ example: 2 })
  rowSpan: number;
}

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

  @ApiPropertyOptional({
    type: [AiEventMapPointResponse],
    nullable: true,
    description: 'Contorno opcional del escenario; null → el frontend sintetiza'
  })
  outline: AiEventMapPoint[] | null;
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

  @ApiProperty({
    nullable: true,
    example: '#f5b301',
    description: 'Color con que el flyer pinta la categoría; null si no se distingue'
  })
  color: string | null;

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

  @ApiPropertyOptional({
    type: [AiEventMapPointResponse],
    nullable: true,
    description: 'Contorno 0..1; null → el frontend reparte por pesos'
  })
  outline: AiEventMapPoint[] | null;

  @ApiPropertyOptional({ type: AiEventMapCellResponse, nullable: true })
  cell: AiEventMapCell | null;

  @ApiPropertyOptional({
    nullable: true,
    example: null,
    description: 'Id del grupo contenedor visual'
  })
  containedBy: string | null;

  @ApiPropertyOptional({ enum: CONTAINED_AT_ENUM, nullable: true })
  containedAt: MapContainedAt | null;

  @ApiProperty({ enum: SHAPE_ENUM, example: 'rect' })
  shape: MapShapeKind;

  @ApiProperty({ enum: LABEL_ORIENTATION_ENUM, example: 'horizontal' })
  labelOrientation: MapLabelOrientation;

  @ApiPropertyOptional({ enum: SHAPE_NOTCH_ENUM, nullable: true })
  shapeNotch: MapShapeNotch | null;

  @ApiProperty({
    example: 8,
    description: 'Ancho relativo 1..10 — obligatorio para el motor de layout del frontend'
  })
  widthWeight: number;

  @ApiProperty({
    example: 4,
    description: 'Alto relativo 1..10 — obligatorio para el motor de layout del frontend'
  })
  heightWeight: number;

  @ApiPropertyOptional({ nullable: true, example: null })
  level: string | null;

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
  @ApiPropertyOptional({
    type: AiEventMapAreaResponse,
    nullable: true,
    description: 'Recuadro del plano dentro del flyer (0..1)'
  })
  mapArea: AiEventMapArea | null;

  @ApiProperty({ type: AiEventMapStageResponse })
  stage: AiEventMapStageResponse;

  @ApiProperty({ type: [AiEventMapCategoryResponse] })
  categories: AiEventMapCategoryResponse[];

  @ApiProperty({
    type: AiEventMapLayoutResponse,
    description:
      'Estructura física con pesos/forma; el frontend dibuja SVG con semantic-layout'
  })
  layout: AiEventMapLayoutResponse;

  constructor(partial: AnalyzeMapResult) {
    this.mapArea = partial.mapArea;
    this.stage = partial.stage;
    this.categories = partial.categories;
    this.layout = partial.layout;
  }
}
