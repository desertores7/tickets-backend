import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min
} from 'class-validator';
import {
  MAX_ADMISSIONS_PER_UNIT,
  TICKET_TYPE_SALE_MODES,
  TicketTypeSaleMode
} from '@modules/event/services/core/ticket-type-sale-mode';

export class CreateTicketTypeRequest {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  @ApiProperty({ description: 'Ticket type name' })
  name: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Ticket type description', required: false, nullable: true })
  description?: string | null;

  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @ApiProperty({ description: 'Ticket price' })
  price: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  @ApiProperty({ description: 'Currency code (ISO 4217)', required: false, example: 'ARS' })
  currency?: string;

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  @ApiProperty({ description: 'Total quantity available' })
  quantity: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @ApiProperty({ description: 'Minimum tickets per order', required: false, default: 1 })
  minPerOrder?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @ApiProperty({ description: 'Maximum tickets per order', required: false, default: 10 })
  maxPerOrder?: number;

  @IsOptional()
  @IsIn(TICKET_TYPE_SALE_MODES)
  @ApiProperty({
    description:
      'Cómo se vende (BR-SALE-010): general (por cantidad, sin elegir lugar), per_person (lugares dentro de una mesa/palco) o whole_unit (la unidad completa; el precio es el de la unidad).',
    enum: TICKET_TYPE_SALE_MODES,
    required: false,
    default: 'general'
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
  @Type(() => Date)
  @IsDate()
  @ApiProperty({ description: 'Sale start date', required: false, nullable: true })
  saleStartDate?: Date | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @ApiProperty({ description: 'Sale end date', required: false, nullable: true })
  saleEndDate?: Date | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @ApiProperty({ description: 'Display sort order', required: false, default: 0 })
  sortOrder?: number;
}
