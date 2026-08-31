import { ApiProperty } from '@nestjs/swagger';
import type {
  FlyerEventExtraction,
  FlyerTicketTypeExtraction,
  HeroImageMimeType,
  HeroImageUsage
} from '../../services/contracts/ievent-ai.service';

export class FlyerTicketTypeExtractionResponse implements FlyerTicketTypeExtraction {
  @ApiProperty()
  name: string;

  @ApiProperty()
  price: number;

  @ApiProperty({ required: false, nullable: true })
  quantity?: number | null;
}

export class FlyerEventExtractionResponse implements FlyerEventExtraction {
  @ApiProperty({ description: 'Título del evento (no slug)' })
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ description: 'ISO o DD/MM/YYYY HH:mm' })
  startDate: string;

  @ApiProperty({ description: 'ISO o DD/MM/YYYY HH:mm' })
  endDate: string;

  @ApiProperty()
  venueName: string;

  @ApiProperty()
  venueAddress: string;

  @ApiProperty()
  venueCity: string;

  @ApiProperty()
  venueCountry: string;

  @ApiProperty({ description: 'Texto para búsqueda en Google Places / Maps' })
  googleMapsQuery: string;

  @ApiProperty({ type: [FlyerTicketTypeExtractionResponse] })
  ticketTypes: FlyerTicketTypeExtractionResponse[];

  @ApiProperty({ required: false, nullable: true })
  artistsLineup?: string | null;
}

export class HeroImageUsageDetailsResponse {
  @ApiProperty({ nullable: true })
  image_tokens: number | null;

  @ApiProperty({ nullable: true })
  text_tokens: number | null;
}

export class HeroImageUsageResponse implements HeroImageUsage {
  @ApiProperty({ nullable: true })
  input_tokens: number | null;

  @ApiProperty({ type: HeroImageUsageDetailsResponse })
  input_tokens_details: HeroImageUsageDetailsResponse;

  @ApiProperty({ nullable: true })
  output_tokens: number | null;

  @ApiProperty({ nullable: true })
  total_tokens: number | null;
}

export class AnalyzeFlyersResponse {
  @ApiProperty({ type: FlyerEventExtractionResponse })
  extraction: FlyerEventExtractionResponse;

  @ApiProperty({
    description: 'PNG del hero en base64 (sin data: prefix). null si falló la generación.',
    nullable: true,
    required: false
  })
  heroImageBase64: string | null;

  @ApiProperty({
    example: 'image/webp',
    description: 'MIME del hero según EVENT_AI_IMAGE_FORMAT.'
  })
  heroMimeType: HeroImageMimeType;

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'Aviso si el hero no se generó (p. ej. timeout) pero la extracción sí.'
  })
  heroWarning?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'Modelo de imagen que produjo el hero (p. ej. gpt-image-2).'
  })
  imageModelUsed?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'low',
    description: 'quality enviada a images.edit (EVENT_AI_IMAGE_QUALITY).'
  })
  generationQuality?: 'low' | 'medium' | 'high' | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: '2048x1152',
    description: 'size enviada a images.edit (EVENT_AI_IMAGE_SIZE).'
  })
  generationSize?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'webp',
    description: 'output_format enviado a images.edit (EVENT_AI_IMAGE_FORMAT).'
  })
  generationFormat?: 'png' | 'webp' | 'jpeg' | null;

  @ApiProperty({
    required: false,
    description: 'true si se usó EVENT_AI_IMAGE_FALLBACK_MODEL en lugar del primario.'
  })
  fallbackUsed?: boolean;

  @ApiProperty({
    required: false,
    nullable: true,
    type: HeroImageUsageResponse,
    description: 'Tokens reportados por OpenAI en images.edit.'
  })
  heroUsage?: HeroImageUsageResponse | null;

  constructor(partial: AnalyzeFlyersResponse) {
    Object.assign(this, partial);
  }
}
