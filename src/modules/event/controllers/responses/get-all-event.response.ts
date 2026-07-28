import { ApiProperty } from '@nestjs/swagger';
import { TEventResponse } from '@modules/event/services/contracts/ievent.service';

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
  @ApiProperty() startDate: Date;
  @ApiProperty() endDate: Date;
  @ApiProperty({ nullable: true }) saleStartDate: Date | null;
  @ApiProperty({ nullable: true }) saleEndDate: Date | null;
  @ApiProperty() isPublished: boolean;
  @ApiProperty() isActive: boolean;
  @ApiProperty() organizationUuid: string;
  @ApiProperty() venueName: string;
  @ApiProperty() venueAddress: string;
  @ApiProperty() venueCity: string;
  @ApiProperty() venueCountry: string;
  @ApiProperty() maxCapacity: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;

  constructor(data: TEventResponse) {
    this.uuid = data.uuid;
    this.name = data.name;
    this.description = data.description;
    this.slug = data.slug;
    this.bannerUrl = data.bannerUrl;
    this.bannerImages = data.bannerImages ?? null;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.saleStartDate = data.saleStartDate;
    this.saleEndDate = data.saleEndDate;
    this.isPublished = data.isPublished;
    this.isActive = data.isActive;
    this.organizationUuid = data.organizationUuid;
    this.venueName = data.venueName;
    this.venueAddress = data.venueAddress;
    this.venueCity = data.venueCity;
    this.venueCountry = data.venueCountry;
    this.maxCapacity = data.maxCapacity;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }
}
