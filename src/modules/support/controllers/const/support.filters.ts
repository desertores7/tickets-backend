import {
  SUPPORT_REQUEST_STATUSES,
  SUPPORT_REQUEST_TYPES
} from '@config/db/entities/system/support_request.entity';
import { IFilterData } from '@root/shared/decorators/filter-query.decorator';

export const supportFilters = [
  {
    name: 'status',
    type: String,
    required: false,
    enumValues: [...SUPPORT_REQUEST_STATUSES]
  },
  {
    name: 'type',
    type: String,
    required: false,
    enumValues: [...SUPPORT_REQUEST_TYPES]
  }
] as const satisfies IFilterData[];
