import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MapSectorLayout, defaultStageLayout } from '@modules/event/services/core/map-grid';
import {
  GridAnalysis,
  GridAnalysisCategory,
  GridAnalysisGroup,
  stageLayoutOfAnalysis,
  toGridAnalysis
} from '@modules/event/services/core/map-grid-analysis';
import type { AnalyzeMapResult } from '../../services/contracts/ievent-ai.service';
import { MapGridCellDto, MapSectorLayoutDto } from '../requests/upsert-event-map.request';

/**
 * Análisis en forma canónica de celdas (grilla 24×24).
 *
 * La ocupación sale solo de `cell` / `unitCells` / `footprintCells`. No viajan
 * recuadros 0..1, contornos, pesos ni `confidence`. El escenario vive en
 * `stageLayout` del mapa (o de la respuesta del job).
 */

export class GridSizeResponse {
  @ApiProperty({ example: 24 }) cols: number;
  @ApiProperty({ example: 24 }) rows: number;
}

export class GridAreaResponse {
  @ApiProperty({ example: 0.1 }) x: number;
  @ApiProperty({ example: 0.05 }) y: number;
  @ApiProperty({ example: 0.8 }) w: number;
  @ApiProperty({ example: 0.9 }) h: number;
}

export class GridStageResponse {
  @ApiProperty() visible: boolean;
  @ApiProperty({ enum: ['top', 'bottom', 'left', 'right', 'center'], example: 'top' })
  position: string;
}

export class GridCategoryResponse implements GridAnalysisCategory {
  @ApiProperty({ example: 'mesa-vip' }) id: string;
  @ApiProperty({ example: 'Mesa VIP' }) label: string;
  @ApiProperty({ nullable: true, example: 100000 }) detectedPrice: number | null;
  @ApiProperty({ enum: ['table', 'box', 'palco', 'seat', 'zone', 'section'] }) elementType: string;
  @ApiProperty({ enum: ['whole_unit', 'per_person', 'general_admission'] }) saleMode: string;
  @ApiProperty({ enum: ['table', 'seat', 'box', 'palco', 'ticket', 'section'] })
  selectionUnit: string;
  @ApiProperty({ nullable: true }) detectedCapacity: number | null;
  @ApiProperty({ nullable: true }) includedAdmissions: number | null;
  @ApiProperty({ nullable: true, example: '#f5b301' }) color: string | null;
}

export class GridGroupResponse implements GridAnalysisGroup {
  @ApiProperty({ example: 'tables-main' }) id: string;
  @ApiProperty({ enum: ['table', 'box', 'palco', 'seat', 'zone', 'section'] }) elementType: string;
  @ApiProperty({ enum: ['column', 'row', 'grid', 'zone', 'freeform'] }) layoutType: string;
  @ApiProperty({ type: [String], example: ['M1', 'M2'] }) labels: string[];
  @ApiProperty({ nullable: true }) category: string | null;
  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    description: 'Bloques de categoría (from/to sobre labels) en grupos multicolor'
  })
  categoryAssignments: Array<Record<string, unknown>>;
  @ApiProperty({ example: 50 }) count: number;
  @ApiProperty({
    type: MapGridCellDto,
    nullable: true,
    description: 'Bounding box del grupo; coincide siempre con unitCells / footprintCells'
  })
  cell: GridAnalysisGroup['cell'];
  @ApiPropertyOptional({
    type: [MapGridCellDto],
    description: 'Celda de cada label (mesas/palcos/boxes), mismo orden que labels'
  })
  unitCells?: GridAnalysisGroup['unitCells'];
  @ApiPropertyOptional({
    type: [MapGridCellDto],
    description: 'Solo en zonas no rectangulares (L/U): celdas 1×1 ocupadas'
  })
  footprintCells?: GridAnalysisGroup['footprintCells'];
  @ApiPropertyOptional() ordering?: string;
  @ApiPropertyOptional() rows?: number;
  @ApiPropertyOptional() columns?: number;
  @ApiPropertyOptional({ description: 'Solo si no es rect y no hay footprintCells' })
  shape?: string;
  @ApiPropertyOptional() shapeNotch?: string;
  @ApiPropertyOptional({ enum: ['vertical'] }) labelOrientation?: 'vertical';
  @ApiPropertyOptional() level?: string;
}

export class GridLayoutResponse {
  @ApiProperty({ type: [GridGroupResponse] }) groups: GridGroupResponse[];
}

export class GridAnalysisResponse implements GridAnalysis {
  @ApiProperty({ type: GridSizeResponse }) grid: GridSizeResponse;
  @ApiPropertyOptional({
    type: GridAreaResponse,
    description: 'Solo en el job de análisis: recorte del plano dentro del flyer (0..1)'
  })
  mapArea?: GridAreaResponse;
  @ApiProperty({ type: GridStageResponse }) stage: GridStageResponse;
  @ApiProperty({ type: [GridCategoryResponse] }) categories: GridCategoryResponse[];
  @ApiProperty({ type: GridLayoutResponse }) layout: GridLayoutResponse;
}

/**
 * Resultado del job de análisis del plano: análisis en celdas + escenario.
 *
 * Omite `warnings` a propósito: son diagnóstico interno (log y
 * `event_ai_map_run`), no algo que el productor tenga que interpretar.
 */
export class AnalyzeFromMapResponse extends GridAnalysisResponse {
  @ApiProperty({ type: MapSectorLayoutDto, description: 'Celdas del escenario' })
  stageLayout: MapSectorLayout;

  constructor(result: AnalyzeMapResult) {
    super();
    const stageLayout = stageLayoutOfAnalysis(result) ?? defaultStageLayout('top');
    const grid = toGridAnalysis(result, { stageLayout, keepMapArea: true })!;
    this.grid = grid.grid;
    if (grid.mapArea) this.mapArea = grid.mapArea;
    this.stage = grid.stage;
    this.categories = grid.categories;
    this.layout = grid.layout;
    this.stageLayout = stageLayout;
  }
}
