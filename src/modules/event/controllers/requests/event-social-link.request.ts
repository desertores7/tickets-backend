import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import {
  EVENT_SOCIAL_NETWORKS,
  EventSocialNetwork
} from '../../const/event-social-network.const';

export class EventSocialLinkRequest {
  @IsIn([...EVENT_SOCIAL_NETWORKS])
  @ApiProperty({
    enum: EVENT_SOCIAL_NETWORKS,
    example: 'instagram',
    description: 'Red o tipo de enlace'
  })
  network: EventSocialNetwork;

  @IsUrl({ require_protocol: true }, { message: 'url debe ser una URL válida (https://...)' })
  @MaxLength(1000)
  @ApiProperty({ example: 'https://instagram.com/showpass', description: 'URL del enlace' })
  url: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsString()
  @MaxLength(80)
  @ApiPropertyOptional({
    nullable: true,
    example: 'Oficial',
    description: 'Etiqueta opcional cuando hay varias del mismo tipo'
  })
  label?: string | null;
}
