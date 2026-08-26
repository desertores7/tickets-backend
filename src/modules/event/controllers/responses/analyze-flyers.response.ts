import { ApiProperty } from '@nestjs/swagger';
import type { FlyerEventExtraction, FlyerTicketTypeExtraction } from '../../services/contracts/ievent-ai.service';

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

export class AnalyzeFlyersResponse {
  @ApiProperty({ type: FlyerEventExtractionResponse })
  extraction: FlyerEventExtractionResponse;

  @ApiProperty({
    description: 'PNG del hero en base64 (sin data: prefix). null si falló la generación.',
    nullable: true,
    required: false
  })
  heroImageBase64: string | null;

  @ApiProperty({ example: 'image/png' })
  heroMimeType: 'image/png';

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'Aviso si el hero no se generó (p. ej. timeout) pero la extracción sí.'
  })
  heroWarning?: string | null;

  constructor(partial: AnalyzeFlyersResponse) {
    Object.assign(this, partial);
  }
}
