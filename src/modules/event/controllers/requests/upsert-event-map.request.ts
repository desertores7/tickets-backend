import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EventMapPointDto {
  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Max(1)
  x: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Max(1)
  y: number;
}

export class EventMapSectorGeometryDto {
  @ApiProperty({ enum: ['rect', 'ellipse', 'polygon'] })
  @IsIn(['rect', 'ellipse', 'polygon'])
  type: 'rect' | 'ellipse' | 'polygon';

  @ApiPropertyOptional({ description: '0–1 (rect/ellipse)' })
  @ValidateIf(o => o.type === 'rect' || o.type === 'ellipse')
  @IsNumber()
  @Min(0)
  @Max(1)
  x?: number;

  @ApiPropertyOptional()
  @ValidateIf(o => o.type === 'rect' || o.type === 'ellipse')
  @IsNumber()
  @Min(0)
  @Max(1)
  y?: number;

  @ApiPropertyOptional()
  @ValidateIf(o => o.type === 'rect' || o.type === 'ellipse')
  @IsNumber()
  @Min(0.01)
  @Max(1)
  w?: number;

  @ApiPropertyOptional()
  @ValidateIf(o => o.type === 'rect' || o.type === 'ellipse')
  @IsNumber()
  @Min(0.01)
  @Max(1)
  h?: number;

  @ApiPropertyOptional({ type: [EventMapPointDto], description: 'Polígono (≥3 puntos)' })
  @ValidateIf(o => o.type === 'polygon')
  @IsArray()
  @ArrayMinSize(3)
  @ValidateNested({ each: true })
  @Type(() => EventMapPointDto)
  points?: EventMapPointDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;
}

export class UpsertEventMapSectorDto {
  @ApiPropertyOptional({ description: 'Omitir o null = sector nuevo' })
  @IsOptional()
  @IsUUID()
  uuid?: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ type: EventMapSectorGeometryDto })
  @ValidateNested()
  @Type(() => EventMapSectorGeometryDto)
  @IsObject()
  geometry: EventMapSectorGeometryDto;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(100)
  canvasWidth?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(100)
  canvasHeight?: number;

  @ApiPropertyOptional({
    description: 'Si se envía, actualiza la URL del plano (también vía POST base-image)'
  })
  @IsOptional()
  @IsString()
  baseImageUrl?: string | null;

  @ApiProperty({ type: [UpsertEventMapSectorDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertEventMapSectorDto)
  sectors: UpsertEventMapSectorDto[];
}

export class SetMapBaseFromMediaRequest {
  @ApiProperty({ description: 'UUID de un item de galería (image) del evento' })
  @IsUUID()
  mediaUuid: string;
}
