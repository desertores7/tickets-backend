import { TEntityResponse } from '@config/db/meta/db.types';
import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { ISearchParams } from '@root/shared/decorators/search-query.decorator';
import { IFiltersParams } from '@root/shared/decorators/filter-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { EventFeeSummary } from '@modules/orders/services/core/fee-summary';
import { BannerImages, BannerVariant } from '../../controllers/const/banner-variant.const';
import { IEventCreate, IEventUpdate, ITicketTypeCreate, ITicketTypeUpdate } from '../core/event';
import { eventFilters } from '../../controllers/const/event.filters';

export type TEventResponse = TEntityResponse<'event', undefined, undefined>;
export type TEventWithTicketTypesResponse = TEntityResponse<'event', { ticketTypes: true }, undefined>;
export type TTicketTypeResponse = TEntityResponse<'ticket_type', undefined, undefined>;

export type TEventFilters = IFiltersParams<typeof eventFilters>;

/** Productor asignado puntualmente a un evento */
export type TEventProducer = {
  uuid: string;
  userUuid: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: Date;
};

export interface IEventService {
  getEvents(
    pagination: IPaginationParams,
    search: ISearchParams,
    filters: TEventFilters,
    role: string | null,
    options?: { mine?: boolean; loggedUser?: string | null }
  ): Promise<{ meta: PaginationMetaResponse; items: TEventResponse[] }>;

  getEventById(uuid: string, role?: string | null): Promise<TEventWithTicketTypesResponse>;

  createEvent(data: IEventCreate, loggedUser: string): Promise<boolean>;

  updateEvent(uuid: string, data: IEventUpdate, loggedUser: string): Promise<void>;

  deleteEvent(uuid: string, loggedUser: string): Promise<boolean>;

  publishEvent(uuid: string, loggedUser: string): Promise<boolean>;

  getTicketTypes(eventUuid: string): Promise<TTicketTypeResponse[]>;

  createTicketType(eventUuid: string, data: ITicketTypeCreate, loggedUser: string): Promise<TTicketTypeResponse>;

  updateTicketType(eventUuid: string, ticketTypeUuid: string, data: ITicketTypeUpdate, loggedUser: string): Promise<TTicketTypeResponse>;

  getFeeSummary(eventUuid: string, loggedUser: string): Promise<EventFeeSummary | null>;

  uploadBanner(
    eventUuid: string,
    variant: BannerVariant,
    file: Express.Multer.File,
    loggedUser: string
  ): Promise<{ variant: BannerVariant; url: string; bannerImages: BannerImages }>;

  deleteBanner(eventUuid: string, variant: BannerVariant, loggedUser: string): Promise<{ bannerImages: BannerImages }>;

  getEventProducers(eventUuid: string, loggedUser: string): Promise<TEventProducer[]>;

  assignProducerToEvent(eventUuid: string, userUuid: string, loggedUser: string): Promise<void>;

  removeProducerFromEvent(eventUuid: string, userUuid: string, loggedUser: string): Promise<void>;
}
