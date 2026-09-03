import { IFilterData } from '@root/shared/decorators/filter-query.decorator';

/** Estados visibles en la UI productora (mapean a status de DB). */
export const PAYOUT_UI_STATUSES = ['complete', 'pending'] as const;
export type PayoutUiStatus = (typeof PAYOUT_UI_STATUSES)[number];

export const payoutFilters = [
  {
    name: 'eventUuid',
    type: String,
    required: false
  },
  {
    name: 'status',
    type: String,
    required: false,
    enumValues: [...PAYOUT_UI_STATUSES]
  }
] as const satisfies IFilterData[];
