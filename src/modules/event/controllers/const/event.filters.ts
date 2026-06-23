import { IFilterData } from '@root/shared/decorators/filter-query.decorator';

export const eventFilters = [
  { name: 'city', type: String, required: false },
  { name: 'country', type: String, required: false },
  { name: 'organizationUuid', type: String, required: false }
] as const satisfies IFilterData[];
