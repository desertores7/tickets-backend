import { IFilterData } from '@root/shared/decorators/filter-query.decorator';
import { ORGANIZATION_VALIDATION_STATUSES } from '@modules/organization/const/organization-fiscal.const';

export const organizationFilters = [
  {
    name: 'validationStatus',
    type: String,
    required: false,
    enumValues: [...ORGANIZATION_VALIDATION_STATUSES]
  }
] as const satisfies IFilterData[];
