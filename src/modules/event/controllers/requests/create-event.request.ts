import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Min
} from 'class-validator';

// Parses "DD/MM/YYYY HH:mm:ss" treating the time as Argentina (UTC-3).
// Also accepts any string natively parseable by Date (ISO 8601, etc.).
function parseArgentinaDate({ value }: { value: unknown }): Date | unknown {
  if (typeof value !== 'string') return value;
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
  if (match) {
    const [, dd, mm, yyyy, hh, min, ss] = match;
    return new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}-03:00`);
  }
  return new Date(value);
}

export class CreateEventRequest {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  @ApiProperty({ description: 'Event name', example: 'Armonia 10' })
  name: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Event description', required: false, nullable: true, example: 'Show musical de cumbia peruana' })
  description?: string | null;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  @ApiProperty({ description: 'URL-friendly unique identifier', example: 'armonia-10-lima-jun2026' })
  slug: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ApiProperty({ description: 'Banner image URL', required: false, nullable: true, example: 'https://cdn.ejemplo.com/armonia10-banner.jpg' })
  bannerUrl?: string | null;

  @IsNotEmpty()
  @Transform(parseArgentinaDate)
  @IsDate()
  @ApiProperty({ description: 'Event start date and time (DD/MM/YYYY HH:mm:ss)', example: '28/07/2026 20:00:00' })
  startDate: Date;

  @IsNotEmpty()
  @Transform(parseArgentinaDate)
  @IsDate()
  @ApiProperty({ description: 'Event end date and time (DD/MM/YYYY HH:mm:ss)', example: '28/07/2026 23:00:00' })
  endDate: Date;

  @IsOptional()
  @Transform(parseArgentinaDate)
  @IsDate()
  @ApiProperty({ description: 'Ticket sale start date (DD/MM/YYYY HH:mm:ss)', required: false, nullable: true, example: '19/06/2026 00:00:00' })
  saleStartDate?: Date | null;

  @IsOptional()
  @Transform(parseArgentinaDate)
  @IsDate()
  @ApiProperty({ description: 'Ticket sale end date (DD/MM/YYYY HH:mm:ss)', required: false, nullable: true, example: '27/07/2026 23:59:59' })
  saleEndDate?: Date | null;

  @IsNotEmpty()
  @IsUUID()
  @ApiProperty({ description: 'Organization UUID that owns this event', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  organizationUuid: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  @ApiProperty({ description: 'Venue name', example: 'Estadio Nacional' })
  venueName: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  @ApiProperty({ description: 'Venue full address', example: 'Av. José Díaz s/n, Lima' })
  venueAddress: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  @ApiProperty({ description: 'Venue city', example: 'Lima' })
  venueCity: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  @ApiProperty({ description: 'Venue country', example: 'Perú' })
  venueCountry: string;

  @IsOptional()
  @IsUrl({ require_protocol: true }, { message: 'googleMapsUrl debe ser una URL válida (https://...)' })
  @MaxLength(1000)
  @ApiProperty({
    description: 'Link de Google Maps para Cómo llegar',
    required: false,
    nullable: true,
    example: 'https://maps.google.com/?q=-34.6037,-58.3816'
  })
  googleMapsUrl?: string | null;

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  @ApiProperty({ description: 'Maximum venue capacity', example: 5000 })
  maxCapacity: number;
}
