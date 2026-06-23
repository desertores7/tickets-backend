import { TEntityResponse } from '@config/db/meta/db.types';
import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { ISearchParams } from '@root/shared/decorators/search-query.decorator';
import { IFiltersParams } from '@root/shared/decorators/filter-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { IEventCreate, IEventUpdate, ITicketTypeCreate, ITicketTypeUpdate } from '../core/event';
import { eventFilters } from '../../controllers/const/event.filters';

export type TEventResponse = TEntityResponse<'event', undefined, undefined>;
export type TEventWithTicketTypesResponse = TEntityResponse<'event', { ticketTypes: true }, undefined>;
export type TTicketTypeResponse = TEntityResponse<'ticket_type', undefined, undefined>;

export type TEventFilters = IFiltersParams<typeof eventFilters>;

export interface IEventService {
  getEvents(
    pagination: IPaginationParams,
    search: ISearchParams,
    filters: TEventFilters,
    role: string | null
  ): Promise<{ meta: PaginationMetaResponse; items: TEventResponse[] }>;

  getEventById(uuid: string): Promise<TEventWithTicketTypesResponse>;

  createEvent(data: IEventCreate, loggedUser: string): Promise<boolean>;

  updateEvent(uuid: string, data: IEventUpdate, loggedUser: string): Promise<void>;

  deleteEvent(uuid: string, loggedUser: string): Promise<boolean>;

  publishEvent(uuid: string, loggedUser: string): Promise<boolean>;

  getTicketTypes(eventUuid: string): Promise<TTicketTypeResponse[]>;

  createTicketType(eventUuid: string, data: ITicketTypeCreate, loggedUser: string): Promise<TTicketTypeResponse>;

  updateTicketType(eventUuid: string, ticketTypeUuid: string, data: ITicketTypeUpdate, loggedUser: string): Promise<TTicketTypeResponse>;
}
