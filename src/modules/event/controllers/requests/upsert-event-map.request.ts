import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Celda de la grilla fija 24×24, índices 1-based. */
export class MapGridCellDto {
  @ApiProperty({ minimum: 1, maximum: 24, example: 3 })
  @IsInt()
  @Min(1)
  @Max(24)
  col: number;

  @ApiProperty({ minimum: 1, maximum: 24, example: 5 })
  @IsInt()
  @Min(1)
  @Max(24)
  row: number;

  @ApiProperty({ minimum: 1, maximum: 24, example: 4, description: 'En kind "cells" siempre 1' })
  @IsInt()
  @Min(1)
  @Max(24)
  colSpan: number;

  @ApiProperty({ minimum: 1, maximum: 24, example: 2, description: 'En kind "cells" siempre 1' })
  @IsInt()
  @Min(1)
  @Max(24)
  rowSpan: number;
}

/**
 * Layout de un sector (o del escenario) en la grilla 24×24.
 *
 * - `rect`: bloque sólido → `cell`.
 * - `cells`: forma libre → `cells` (solo 1×1, sin duplicados, idealmente
 *   conexas en 4 direcciones).
 *
 * Bordes, spans y solapes se validan en el servicio.
 */
export class MapSectorLayoutDto {
  @ApiProperty({ enum: ['rect', 'cells'] })
  @IsIn(['rect', 'cells'])
  kind: 'rect' | 'cells';

  @ApiPropertyOptional({ type: MapGridCellDto, description: 'Obligatorio si kind = "rect"' })
  @ValidateIf(o => o.kind === 'rect')
  @IsObject()
  @ValidateNested()
  @Type(() => MapGridCellDto)
  cell?: MapGridCellDto;

  @ApiPropertyOptional({
    type: [MapGridCellDto],
    description: 'Obligatorio si kind = "cells". Celdas 1×1, sin duplicados.'
  })
  @ValidateIf(o => o.kind === 'cells')
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(24 * 24)
  @ValidateNested({ each: true })
  @Type(() => MapGridCellDto)
  cells?: MapGridCellDto[];
}

export class UpsertEventMapSectorDto {
  @ApiPropertyOptional({ description: 'Omitir o null = sector nuevo' })
  @IsOptional()
  @IsUUID()
  uuid?: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Piso impreso en el plano ("1ER PISO"). La unicidad del nombre se evalúa ' +
      'por (nivel, nombre): sin esto, dos pisos que numeran desde 1 chocan.'
  })
  @IsOptional()
  @IsString()
  level?: string | null;

  @ApiProperty({
    type: MapSectorLayoutDto,
    description:
      'Posición del sector en la grilla 24×24. Única fuente de verdad: ninguna celda ' +
      'puede repetirse entre sectores ni pisar el escenario.'
  })
  @ValidateNested()
  @Type(() => MapSectorLayoutDto)
  @IsObject()
  layout: MapSectorLayoutDto;

  @ApiPropertyOptional({ nullable: true, example: '#c8004a' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  color?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isNumbered?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  capacity?: number | null;

  @ApiProperty({ type: [String], description: 'UUIDs de ticket_type del evento' })
  @IsArray()
  @ArrayMinSize(0)
  @IsUUID('4', { each: true })
  ticketTypeUuids: string[];
}

export class UpsertEventMapRequest {
  @ApiPropertyOptional({ default: 'Mapa del evento' })
  @IsOptional()
  @IsString()
  name?: string;


  @ApiPropertyOptional({
    description: 'Si se envía, actualiza la URL del plano (también vía POST base-image)'
  })
  @IsOptional()
  @IsString()
  baseImageUrl?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Layout abstracto de la IA (AnalyzeMapResult). Null = mapa a mano. ' +
      'Si se omite, se conserva el valor ya guardado.'
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsObject()
  analysis?: Record<string, unknown> | null;

  @ApiPropertyOptional({
    type: MapSectorLayoutDto,
    nullable: true,
    description:
      'Celdas del escenario. Si se omite se conserva el guardado (o el default según ' +
      '`analysis.stage.position`). null = volver al default.'
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @ValidateNested()
  @Type(() => MapSectorLayoutDto)
  @IsObject()
  stageLayout?: MapSectorLayoutDto | null;

  @ApiProperty({ type: [UpsertEventMapSectorDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertEventMapSectorDto)
  sectors: UpsertEventMapSectorDto[];
}

export class SetTicketTypeMapSectorsRequest {
  @ApiProperty({
    type: [String],
    description: 'Conjunto final de sectores del mapa asociados a la tanda. Un array vacío la deja sin sector.'
  })
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  sectorUuids: string[];
}

export class SetMapBaseFromMediaRequest {
  @ApiProperty({ description: 'UUID de un item de galería (image) del evento' })
  @IsUUID()
  mediaUuid: string;
}
