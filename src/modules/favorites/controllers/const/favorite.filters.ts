import { IFilterData } from '@root/shared/decorators/filter-query.decorator';

/**
 * Corte temporal del listado de favoritos. Se mira `event.endDate` (no startDate)
 * para que un evento en curso siga contando como próximo.
 */
export const FAVORITE_TIMEFRAME = ['upcoming', 'past', 'all'] as const;
export type TFavoriteTimeframe = (typeof FAVORITE_TIMEFRAME)[number];

export const favoriteFilters = [
  {
    name: 'timeframe',
    type: String,
    required: false,
    enumValues: [...FAVORITE_TIMEFRAME]
  }
] as const satisfies IFilterData[];

export const FAVORITE_ORDER_COLUMNS = ['createdAt', 'startDate', 'name'] as const;
