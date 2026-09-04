import { IFilterData } from '@root/shared/decorators/filter-query.decorator';
import { MANUAL_ITEM_CATEGORIES } from '@config/db/entities/tickets/org_manual_item.entity';

export const MANUAL_ITEM_ACTIVE_FILTERS = ['true', 'false'] as const;
export type ManualItemActiveFilter = (typeof MANUAL_ITEM_ACTIVE_FILTERS)[number];

/** Filtros del listado de ítems manuales de la productora. */
export const manualItemFilters = [
  {
    name: 'category',
    type: String,
    required: false,
    enumValues: [...MANUAL_ITEM_CATEGORIES]
  },
  {
    name: 'active',
    type: String,
    required: false,
    enumValues: [...MANUAL_ITEM_ACTIVE_FILTERS]
  }
] as const satisfies IFilterData[];

/**
 * Columnas ordenables (order_by=columna:asc|desc):
 * - `name:asc` -> nombre A–Z
 * - `createdAt:desc` -> más reciente
 * - `referencePrice:desc` -> mayor precio
 */
export const MANUAL_ITEM_ORDER_COLUMNS = ['name', 'createdAt', 'referencePrice'] as const;
