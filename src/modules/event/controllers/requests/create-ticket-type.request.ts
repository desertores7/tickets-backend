import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min
} from 'class-validator';

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
