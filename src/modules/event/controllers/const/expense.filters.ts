import { IFilterData } from '@root/shared/decorators/filter-query.decorator';
import { EXPENSE_CATEGORIES } from './expense-category.const';

/** Filtros del listado de gastos del evento. */
export const expenseFilters = [
  { name: 'category', type: String, required: false, enumValues: [...EXPENSE_CATEGORIES] }
] as const satisfies IFilterData[];

/**
 * Columnas ordenables del listado de gastos (order_by=columna:asc|desc):
 * - `expenseDate:desc` -> mas reciente   `expenseDate:asc` -> mas antiguo
 * - `totalAmount:desc` -> mayor precio   `totalAmount:asc` -> menor precio
 */
export const EXPENSE_ORDER_COLUMNS = ['expenseDate', 'totalAmount'] as const;
