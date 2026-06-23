import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

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
  @MaxLength(500)
  @ApiProperty({ description: 'Banner image URL', required: false, nullable: true })
  bannerUrl?: string | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @ApiProperty({ description: 'Event start date and time', required: false })
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @ApiProperty({ description: 'Event end date and time', required: false })
  endDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @ApiProperty({ description: 'Ticket sale start date', required: false, nullable: true })
  saleStartDate?: Date | null;

  @IsOptional()
  @Type(() => Date)
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
  @IsInt()
  @Min(1)
  @ApiProperty({ description: 'Maximum venue capacity', required: false })
  maxCapacity?: number;
}
