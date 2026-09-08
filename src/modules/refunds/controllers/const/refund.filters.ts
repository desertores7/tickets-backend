import { IFilterData } from '@root/shared/decorators/filter-query.decorator';
import { REFUND_REQUEST_STATUSES } from '@config/db/entities/tickets/refund_request.entity';

/** Filtros del listado de solicitudes (`GET /refunds`). */
export const refundFilters = [
  { name: 'eventUuid', type: String, required: false },
  { name: 'status', type: String, required: false, enumValues: [...REFUND_REQUEST_STATUSES] },
  { name: 'dateFrom', type: String, required: false },
  { name: 'dateTo', type: String, required: false }
] as const satisfies IFilterData[];
