import { IFilterData } from '@root/shared/decorators/filter-query.decorator';

export const MY_TICKET_STATUS = ['active', 'used', 'all'] as const;
export type TMyTicketStatus = (typeof MY_TICKET_STATUS)[number];

/**
 * Corte temporal del listado. Se mira `endDate` y no `startDate` para que un
 * evento en curso siga contando como próximo.
 */
export const MY_TICKET_TIMEFRAME = ['upcoming', 'past', 'all'] as const;
export type TMyTicketTimeframe = (typeof MY_TICKET_TIMEFRAME)[number];

/** Filtros de GET /tickets/me. Sin query: activas + usadas, todos los plazos. */
export const myTicketFilters = [
  { name: 'status', type: String, required: false, enumValues: [...MY_TICKET_STATUS] },
  { name: 'timeframe', type: String, required: false, enumValues: [...MY_TICKET_TIMEFRAME] }
] as const satisfies IFilterData[];
