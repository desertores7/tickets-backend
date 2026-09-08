import { ApiProperty } from '@nestjs/swagger';
import { TEventDetailItem } from '@modules/event/services/contracts/ievent.service';
import { EventImagesResponse } from './event-images.response';

/** Datos públicos de la productora dueña del evento (nombre, contacto y redes). */
export class EventProducerPublicResponse {
  @ApiProperty({ description: 'Nombre comercial de la productora' })
  name: string;

  @ApiProperty({ nullable: true, description: 'Sitio web' })
  website: string | null;

  @ApiProperty({ nullable: true, description: 'Teléfono de contacto' })
  phone: string | null;

  @ApiProperty({ nullable: true })
  instagram: string | null;

  @ApiProperty({ nullable: true })
  tiktok: string | null;

  @ApiProperty({ nullable: true })
  facebook: string | null;

  @ApiProperty({ nullable: true })
  socialX: string | null;

  constructor(data: TEventDetailItem['producer']) {
    this.name = data.name;
    this.website = data.website;
    this.phone = data.phone;
    this.instagram = data.instagram;
    this.tiktok = data.tiktok;
    this.facebook = data.facebook;
    this.socialX = data.socialX;
  }
}

export class GetIdEventResponse {
  @ApiProperty() uuid: string;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true }) description: string | null;
  @ApiProperty({ nullable: true, description: 'HTML de “Sobre el evento”' })
  content: string | null;
  @ApiProperty({
    nullable: true,
    description: 'Redes del evento',
    example: [{ network: 'instagram', url: 'https://instagram.com/showpass', label: 'Oficial' }]
  })
  socialLinks: { network: string; url: string; label?: string | null }[] | null;
  @ApiProperty() slug: string;
  @ApiProperty({ type: EventImagesResponse, description: 'Imágenes del evento (flyer, banners, mapa)' })
  eventImages: EventImagesResponse;
  @ApiProperty() startDate: Date;
  @ApiProperty() endDate: Date;
  @ApiProperty({ nullable: true }) saleStartDate: Date | null;
  @ApiProperty({ nullable: true }) saleEndDate: Date | null;
  @ApiProperty() isPublished: boolean;
  @ApiProperty({ nullable: true, description: 'Momento en que salió a la venta. Null si es borrador.' })
  publishedAt: Date | null;
  @ApiProperty() isActive: boolean;
  @ApiProperty() organizationUuid: string;
  @ApiProperty({
    type: EventProducerPublicResponse,
    description: 'Productora dueña: nombre comercial y redes'
  })
  producer: EventProducerPublicResponse;
  @ApiProperty() venueName: string;
  @ApiProperty() venueAddress: string;
  @ApiProperty() venueCity: string;
  @ApiProperty() venueCountry: string;
  @ApiProperty() venuePostalCode: string;
  @ApiProperty({ nullable: true, description: 'Link de Google Maps para Cómo llegar' })
  googleMapsUrl: string | null;
  @ApiProperty({
    nullable: true,
    description: 'Lineup estructurado (BR-EVENT-016)',
    type: [String]
  })
  lineup: string[] | null;
  @ApiProperty() maxCapacity: number;
  @ApiProperty({ nullable: true, description: 'Cancelado el (BR-EVENT-010)' })
  cancelledAt: Date | null;
  @ApiProperty({ nullable: true }) cancellationReason: string | null;
  @ApiProperty({ nullable: true, description: 'Cierre de venta (BR-EVENT-013)' })
  salesClosedAt: Date | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;

  constructor(data: TEventDetailItem) {
    this.uuid = data.uuid;
    this.name = data.name;
    this.description = data.description;
    this.content = data.content ?? null;
    this.socialLinks = data.socialLinks ?? null;
    this.slug = data.slug;
    this.eventImages = new EventImagesResponse(data.eventImages);
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.saleStartDate = data.saleStartDate;
    this.saleEndDate = data.saleEndDate;
    this.isPublished = data.isPublished;
    this.publishedAt = data.publishedAt ?? null;
    this.isActive = data.isActive;
    this.organizationUuid = data.organizationUuid;
    this.producer = new EventProducerPublicResponse(data.producer);
    this.venueName = data.venueName;
    this.venueAddress = data.venueAddress;
    this.venueCity = data.venueCity;
    this.venueCountry = data.venueCountry;
    this.venuePostalCode = data.venuePostalCode ?? '';
    this.googleMapsUrl = data.googleMapsUrl ?? null;
    this.lineup = data.lineup ?? null;
    this.maxCapacity = data.maxCapacity;
    this.cancelledAt = data.cancelledAt ?? null;
    this.cancellationReason = data.cancellationReason ?? null;
    this.salesClosedAt = data.salesClosedAt ?? null;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }
}
