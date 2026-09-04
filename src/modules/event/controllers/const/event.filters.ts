import { IFilterData } from '@root/shared/decorators/filter-query.decorator';

export const eventFilters = [
  { name: 'city', type: String, required: false },
  { name: 'country', type: String, required: false },
  { name: 'organizationUuid', type: String, required: false },
  /** Estado del evento en el backoffice. Ver EVENT_LIST_STATUS. */
  { name: 'status', type: String, required: false },
  /** Rango sobre startDate (YYYY-MM-DD, inclusive). */
  { name: 'dateFrom', type: String, required: false },
  { name: 'dateTo', type: String, required: false }
] as const satisfies IFilterData[];

/**
 * Estados que el backoffice puede pedir. `draft`/`published` miran isPublished;
 * `cancelled` y `sales_closed` miran sus timestamps, que son independientes de
 * la publicacion (un evento publicado puede estar cancelado).
 * `finished` = endDate en el pasado (útil para el listado del productor).
 */
export const EVENT_LIST_STATUS = ['draft', 'published', 'cancelled', 'sales_closed', 'finished'] as const;
export type TEventListStatus = (typeof EVENT_LIST_STATUS)[number];

/** Columnas ordenables del listado (order_by=columna:asc|desc). */
export const EVENT_ORDER_COLUMNS = ['startDate', 'createdAt', 'name'] as const;
