import { IFilterData } from '@root/shared/decorators/filter-query.decorator';

export const userFilters = [
  { name: 'activeUser', type: Number, required: false },
  { name: 'roleUuid', type: String, required: false }
] as const satisfies IFilterData[];

/** Columnas ordenables del listado (order_by=columna:asc|desc). */
export const USER_ORDER_COLUMNS = ['createdAt', 'firstName', 'lastName', 'email'] as const;
