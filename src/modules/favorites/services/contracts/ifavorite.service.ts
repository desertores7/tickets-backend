import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { ISearchParams } from '@root/shared/decorators/search-query.decorator';
import { IOrderParams } from '@root/shared/decorators/order-query.decorator';
import { IFiltersParams } from '@root/shared/decorators/filter-query.decorator';
import { FAVORITE_ORDER_COLUMNS, favoriteFilters } from '../../controllers/const/favorite.filters';

export type TFavoriteEventCard = {
  uuid: string;
  slug: string;
  name: string;
  description: string | null;
  bannerUrl: string | null;
  startDate: Date;
  endDate: Date;
  venueName: string;
  venueCity: string | null;
  venueAddress: string | null;
  soldOut: boolean;
};

export type TFavoriteItem = {
  uuid: string;
  createdAt: Date;
  event: TFavoriteEventCard;
};

export type TFavoritesPage = {
  items: TFavoriteItem[];
  total: number;
  page: number;
  limit: number;
};

export type TFavoriteFilters = IFiltersParams<typeof favoriteFilters>;
export type TFavoriteOrder = IOrderParams<typeof FAVORITE_ORDER_COLUMNS>;

export interface IFavoriteService {
  listMine(
    userUuid: string,
    pagination: IPaginationParams,
    search: ISearchParams,
    filters: TFavoriteFilters,
    order: TFavoriteOrder
  ): Promise<TFavoritesPage>;

  getStatus(userUuid: string, eventUuid: string): Promise<{ favorited: boolean; favoriteUuid: string | null }>;

  add(userUuid: string, eventUuid: string): Promise<TFavoriteItem>;

  remove(userUuid: string, eventUuid: string): Promise<void>;
}
