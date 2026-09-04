import { IFilterData } from '@root/shared/decorators/filter-query.decorator';

/** Filtros del listado de catálogo Mercado Pago de la productora. */
export const mpCatalogFilters = [
  {
    name: 'accountUuid',
    type: String,
    required: false
  }
] as const satisfies IFilterData[];

/**
 * Columnas ordenables (order_by=columna:asc|desc):
 * - `name:asc` -> nombre A–Z
 * - `price:desc` -> mayor precio
 * - `lastSyncAt:desc` -> más reciente sync
 */
export const MP_CATALOG_ORDER_COLUMNS = ['name', 'price', 'lastSyncAt'] as const;
