import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  MAX_ADMISSIONS_PER_UNIT,
  TICKET_TYPE_SALE_MODES,
  TicketTypeSaleMode
} from '@modules/event/services/core/ticket-type-sale-mode';

function parseArgentinaDate({ value }: { value: unknown }): Date | unknown {
  if (value === null || value === undefined || value === '') return value;
  if (typeof value !== 'string') return value;
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
  if (match) {
    const [, dd, mm, yyyy, hh, min, ss] = match;
    return new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}-03:00`);
  }
  return new Date(value);
}

export class UpdateTicketTypeRequest {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @ApiProperty({ description: 'Ticket type name', required: false })
  name?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Ticket type description', required: false, nullable: true })
  description?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @ApiProperty({
    description: 'Ticket price (ARS). Solo editable si el evento no está publicado o la tanda no vendió.',
    required: false
  })
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiProperty({
    description: 'Total quantity. Solo editable en borrador o si no hay ventas que lo contradigan.',
    required: false
  })
  quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiProperty({ description: 'Minimum tickets per order', required: false })
  minPerOrder?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiProperty({ description: 'Maximum tickets per order', required: false })
  maxPerOrder?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiProperty({
    description:
      'Tope acumulado de entradas por comprador entre TODAS sus órdenes. Mandar null lo saca.',
    required: false,
    nullable: true
  })
  maxPerBuyer?: number | null;

  @IsOptional()
  @IsIn(TICKET_TYPE_SALE_MODES)
  @ApiProperty({
    description:
      'Cómo se vende (BR-SALE-010): general (por cantidad, sin elegir lugar), per_person (lugares dentro de una mesa/palco) o whole_unit (la unidad completa; el precio es el de la unidad).',
    enum: TICKET_TYPE_SALE_MODES,
    required: false
  })
  saleMode?: TicketTypeSaleMode;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_ADMISSIONS_PER_UNIT)
  @ApiProperty({
    description: 'Entradas que genera comprar una unidad completa. Obligatorio con saleMode = whole_unit; se ignora en los otros modos.',
    required: false,
    nullable: true,
    example: 10
  })
  admissionsPerUnit?: number | null;

  @IsOptional()
  @Transform(parseArgentinaDate)
  @IsDate()
  @ApiProperty({
    description: 'Sale start date (DD/MM/YYYY HH:mm:ss)',
    required: false,
    nullable: true,
    example: '19/06/2026 00:00:00'
  })
  saleStartDate?: Date | null;

  @IsOptional()
  @Transform(parseArgentinaDate)
  @IsDate()
  @ApiProperty({
    description: 'Sale end date (DD/MM/YYYY HH:mm:ss)',
    required: false,
    nullable: true,
    example: '27/07/2026 23:59:59'
  })
  saleEndDate?: Date | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @ApiProperty({ description: 'Display sort order', required: false })
  sortOrder?: number;
}
