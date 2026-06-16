import { IFilterData } from '@root/shared/decorators/filter-query.decorator';

export const userFileFilters = [
  {
    name: 'fileTypeId',
    type: String,
    required: false
  }
] as const satisfies IFilterData[];
