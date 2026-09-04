import { IFilterData } from '@root/shared/decorators/filter-query.decorator';
import { COUPON_TYPES } from '@config/db/entities/tickets/coupon.entity';

export const COUPON_STATUS_FILTERS = ['usable', 'paused', 'exhausted', 'expired'] as const;
export type CouponStatusFilter = (typeof COUPON_STATUS_FILTERS)[number];

/** Filtros del listado de cupones del evento. */
export const couponFilters = [
  { name: 'type', type: String, required: false, enumValues: [...COUPON_TYPES] },
  { name: 'status', type: String, required: false, enumValues: [...COUPON_STATUS_FILTERS] }
] as const satisfies IFilterData[];

/**
 * Columnas ordenables (order_by=columna:asc|desc):
 * - `createdAt:desc` -> más reciente
 * - `usedCount:desc` -> más usados
 * - `name:asc` -> nombre A–Z
 */
export const COUPON_ORDER_COLUMNS = ['createdAt', 'usedCount', 'name'] as const;
