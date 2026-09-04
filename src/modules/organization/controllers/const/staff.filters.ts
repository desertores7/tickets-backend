import { IFilterData } from '@root/shared/decorators/filter-query.decorator';

/** Filtros del listado de staff de la productora. */
export const staffFilters = [
  {
    name: 'role',
    type: String,
    required: false,
    enumValues: ['producer', 'validator', 'cashier']
  },
  {
    name: 'status',
    type: String,
    required: false,
    enumValues: ['pending', 'active', 'inactive']
  }
] as const satisfies IFilterData[];
