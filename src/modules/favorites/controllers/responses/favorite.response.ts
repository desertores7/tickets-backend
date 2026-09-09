import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import {
  TFavoriteEventCard,
  TFavoriteItem,
  TFavoritesPage
} from '../../services/contracts/ifavorite.service';

export class FavoriteEventCardResponse {
  @ApiProperty()
  uuid: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true })
  description: string | null;

  @ApiProperty({ nullable: true })
  bannerUrl: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  startDate: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  endDate: Date;

  @ApiProperty()
  venueName: string;

  @ApiProperty({ nullable: true })
  venueCity: string | null;

  @ApiProperty({ nullable: true })
  venueAddress: string | null;

  @ApiProperty()
  soldOut: boolean;

  constructor(data: TFavoriteEventCard) {
    this.uuid = data.uuid;
    this.slug = data.slug;
    this.name = data.name;
    this.description = data.description;
    this.bannerUrl = data.bannerUrl;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.venueName = data.venueName;
    this.venueCity = data.venueCity;
    this.venueAddress = data.venueAddress;
    this.soldOut = data.soldOut;
  }
}

export class FavoriteItemResponse {
  @ApiProperty()
  uuid: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: FavoriteEventCardResponse })
  event: FavoriteEventCardResponse;

  constructor(data: TFavoriteItem) {
    this.uuid = data.uuid;
    this.createdAt = data.createdAt;
    this.event = new FavoriteEventCardResponse(data.event);
  }
}

export class ListMyFavoritesResponse {
  @ApiProperty({ type: [FavoriteItemResponse] })
  items: FavoriteItemResponse[];

  @ApiProperty({ type: PaginationMetaResponse })
  meta: PaginationMetaResponse;

  constructor(page: TFavoritesPage) {
    this.items = page.items.map(i => new FavoriteItemResponse(i));
    this.meta = new PaginationMetaResponse({
      total: page.total,
      page: page.page,
      limit: page.limit
    });
  }
}

export class FavoriteStatusResponse {
  @ApiProperty()
  favorited: boolean;

  @ApiProperty({ nullable: true, description: 'UUID del favorito si existe' })
  favoriteUuid: string | null;

  constructor(favorited: boolean, favoriteUuid: string | null = null) {
    this.favorited = favorited;
    this.favoriteUuid = favoriteUuid;
  }
}
