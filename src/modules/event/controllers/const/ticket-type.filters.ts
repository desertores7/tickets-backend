import { IFilterData } from '@root/shared/decorators/filter-query.decorator';

/**
 * Filtros del listado de tandas de un evento.
 *
 * - `sector`: clave de grupo del panel Entradas (familyLabel / prefijo normalizado),
 *   o `__sin-sector__` para tandas sin vínculo al mapa.
 */
export const ticketTypeFilters = [
  { name: 'sector', type: String, required: false }
] as const satisfies IFilterData[];

/** Grupo virtual: entradas sin sector en el mapa (mismo id que el frontend). */
export const TICKET_TYPE_UNASSIGNED_SECTOR = '__sin-sector__';

/**
 * Columnas ordenables (order_by=columna:asc|desc):
 * - `quantity:asc` / `quantity:desc` -> menor / mayor stock
 * - `price:desc` / `price:asc` -> mayor / menor precio
 */
export const TICKET_TYPE_ORDER_COLUMNS = ['name', 'price', 'quantity'] as const;
