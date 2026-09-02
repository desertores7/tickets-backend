import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, IsString, IsUrl, MaxLength, Min } from 'class-validator';

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

export class UpdateEventRequest {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @ApiProperty({ description: 'Event name', required: false })
  name?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Event description', required: false, nullable: true })
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @ApiProperty({ description: 'URL-friendly unique identifier (solo borrador)', required: false })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ApiProperty({ description: 'Banner image URL', required: false, nullable: true })
  bannerUrl?: string | null;

  @IsOptional()
  @Transform(parseArgentinaDate)
  @IsDate()
  @ApiProperty({ description: 'Event start date and time (DD/MM/YYYY HH:mm:ss o ISO)', required: false })
  startDate?: Date;

  @IsOptional()
  @Transform(parseArgentinaDate)
  @IsDate()
  @ApiProperty({ description: 'Event end date and time (DD/MM/YYYY HH:mm:ss o ISO)', required: false })
  endDate?: Date;

  @IsOptional()
  @Transform(parseArgentinaDate)
  @IsDate()
  @ApiProperty({ description: 'Ticket sale start date', required: false, nullable: true })
  saleStartDate?: Date | null;

  @IsOptional()
  @Transform(parseArgentinaDate)
  @IsDate()
  @ApiProperty({ description: 'Ticket sale end date', required: false, nullable: true })
  saleEndDate?: Date | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @ApiProperty({ description: 'Venue name', required: false })
  venueName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ApiProperty({ description: 'Venue full address', required: false })
  venueAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ApiProperty({ description: 'Venue city', required: false })
  venueCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ApiProperty({ description: 'Venue country', required: false })
  venueCountry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @ApiProperty({ description: 'Venue postal code', required: false })
  venuePostalCode?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? null : value))
  @IsUrl({ require_protocol: true }, { message: 'googleMapsUrl debe ser una URL válida (https://...)' })
  @MaxLength(1000)
  @ApiProperty({ description: 'Link de Google Maps para Cómo llegar', required: false, nullable: true })
  googleMapsUrl?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiProperty({ description: 'Maximum venue capacity', required: false })
  maxCapacity?: number;
}
