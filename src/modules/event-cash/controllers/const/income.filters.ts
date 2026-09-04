import { IFilterData } from '@root/shared/decorators/filter-query.decorator';
import { INCOME_METHODS } from '@config/db/entities/tickets/event_income.entity';

/** Filtros del listado de ingresos del evento. */
export const incomeFilters = [
  { name: 'method', type: String, required: false, enumValues: [...INCOME_METHODS] }
] as const satisfies IFilterData[];

/**
 * Columnas ordenables del listado de ingresos (order_by=columna:asc|desc):
 * - `occurredAt:desc` -> mas reciente   `occurredAt:asc` -> mas antiguo
 * - `total:desc` -> mayor monto         `total:asc` -> menor monto
 */
export const INCOME_ORDER_COLUMNS = ['occurredAt', 'total'] as const;
