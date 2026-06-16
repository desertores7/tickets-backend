import { IFilterData } from '@root/shared/decorators/filter-query.decorator';

export const userFilters = [
  { name: 'activeUser', type: Number, required: false },
  { name: 'roleUuid', type: String, required: false }
] as const satisfies IFilterData[];
