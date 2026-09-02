import { ApiProperty } from '@nestjs/swagger';
import { TEventListItem } from '@modules/event/services/contracts/ievent.service';

export class GetAllEventResponse {
  @ApiProperty() uuid: string;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true }) description: string | null;
  @ApiProperty() slug: string;
  @ApiProperty({ nullable: true }) bannerUrl: string | null;
  @ApiProperty({
    nullable: true,
    description: 'URLs por plataforma',
    example: { desktop: '…/desktop-1.webp', mobile: '…/mobile-1.webp', thumbnail: '…/thumbnail-1.webp' }
  })
  bannerImages: Record<string, string> | null;
  @ApiProperty({
    nullable: true,
    description: 'URL del flyer principal (primera imagen de galería). Preferida para cards del listado.'
  })
  coverUrl: string | null;
  @ApiProperty() startDate: Date;
  @ApiProperty() endDate: Date;
  @ApiProperty({ nullable: true }) saleStartDate: Date | null;
  @ApiProperty({ nullable: true }) saleEndDate: Date | null;
  @ApiProperty() isPublished: boolean;
  @ApiProperty({ nullable: true, description: 'Momento en que salió a la venta. Null si es borrador.' })
  publishedAt: Date | null;
  @ApiProperty() isActive: boolean;
  @ApiProperty() organizationUuid: string;
  @ApiProperty() venueName: string;
  @ApiProperty() venueAddress: string;
  @ApiProperty() venueCity: string;
  @ApiProperty() venueCountry: string;
  @ApiProperty() venuePostalCode: string;
  @ApiProperty({ nullable: true, description: 'Link de Google Maps para Cómo llegar' })
  googleMapsUrl: string | null;
  @ApiProperty() maxCapacity: number;

  @ApiProperty({
    type: [String],
    nullable: true,
    description: 'Lineup estructurado (BR-EVENT-016)'
  })
  lineup: string[] | null;

  @ApiProperty({ nullable: true, description: 'Cancelado el (BR-EVENT-010)' })
  cancelledAt: Date | null;

  @ApiProperty({ nullable: true }) cancellationReason: string | null;

  @ApiProperty({ nullable: true, description: 'Corte manual de venta (BR-EVENT-013)' })
  salesClosedAt: Date | null;

  @ApiProperty({
    description:
      'True si el evento tiene tipos de entrada pero ninguno con disponibilidad. ' +
      'Se calcula sobre `availableQuantity`, que baja al confirmarse el pago: ' +
      'las reservas sin pagar no cuentan como vendidas.'
  })
  soldOut: boolean;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;

  constructor(data: TEventListItem) {
    this.uuid = data.uuid;
    this.name = data.name;
    this.description = data.description;
    this.slug = data.slug;
    this.bannerUrl = data.bannerUrl;
    this.bannerImages = data.bannerImages ?? null;
    this.coverUrl = data.coverUrl ?? null;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.saleStartDate = data.saleStartDate;
    this.saleEndDate = data.saleEndDate;
    this.isPublished = data.isPublished;
    this.publishedAt = data.publishedAt ?? null;
    this.isActive = data.isActive;
    this.organizationUuid = data.organizationUuid;
    this.venueName = data.venueName;
    this.venueAddress = data.venueAddress;
    this.venueCity = data.venueCity;
    this.venueCountry = data.venueCountry;
    this.venuePostalCode = data.venuePostalCode ?? '';
    this.googleMapsUrl = data.googleMapsUrl ?? null;
    this.maxCapacity = data.maxCapacity;
    this.lineup = data.lineup ?? null;
    this.cancelledAt = data.cancelledAt ?? null;
    this.cancellationReason = data.cancellationReason ?? null;
    this.salesClosedAt = data.salesClosedAt ?? null;
    this.soldOut = data.soldOut;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }
}
