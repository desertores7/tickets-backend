import { TEntityResponse } from '@config/db/meta/db.types';
import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { ISearchParams } from '@root/shared/decorators/search-query.decorator';
import { IFiltersParams } from '@root/shared/decorators/filter-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { EventFeeSummary } from '@modules/orders/services/core/fee-summary';
import { EventMediaKind } from '@config/db/entities/tickets/event_media.entity';
import { EventMapSectorGeometry } from '@config/db/entities/tickets/event_map_sector.entity';
import { BannerImages, BannerVariant } from '../../controllers/const/banner-variant.const';
import { IEventCreate, IEventUpdate, ITicketTypeCreate, ITicketTypeUpdate, ITicketTypeBulkUpdate } from '../core/event';
import { EVENT_ORDER_COLUMNS, eventFilters } from '../../controllers/const/event.filters';
import { EXPENSE_ORDER_COLUMNS, expenseFilters } from '../../controllers/const/expense.filters';
import { IOrderParams } from '@root/shared/decorators/order-query.decorator';
import { ExpenseCategory } from '@modules/event/controllers/const/expense-category.const';
import type { TEventChangeItem, TEventChangesResult } from '../implementation/event-change.service';

export type TEventResponse = TEntityResponse<'event', undefined, undefined>;
export type TEventWithTicketTypesResponse = TEntityResponse<'event', { ticketTypes: true }, undefined>;
export type TTicketTypeResponse = TEntityResponse<'ticket_type', undefined, undefined>;
export type TEventMediaResponse = TEntityResponse<'event_media', undefined, undefined>;

export type TEventMapSector = {
  uuid: string;
  name: string;
  geometry: EventMapSectorGeometry;
  sortOrder: number;
  isNumbered: boolean;
  capacity: number | null;
  ticketTypeUuids: string[];
};

export type TEventMap = {
  uuid: string;
  eventUuid: string;
  name: string;
  baseImageUrl: string | null;
  canvasWidth: number;
  canvasHeight: number;
  sectors: TEventMapSector[];
};

export type TUpsertEventMapSector = {
  uuid?: string;
  name: string;
  geometry: EventMapSectorGeometry;
  sortOrder?: number;
  isNumbered?: boolean;
  capacity?: number | null;
  ticketTypeUuids: string[];
};

export type TUpsertEventMap = {
  name?: string;
  canvasWidth?: number;
  canvasHeight?: number;
  baseImageUrl?: string | null;
  sectors: TUpsertEventMapSector[];
};

/**
 * Item del listado: el evento más si quedan entradas por vender. Se resuelve en
 * el listado para no obligar al frontend a pedir el detalle de cada tarjeta.
 * `coverUrl` = primera imagen de galería (flyer principal), si existe.
 */
export type TEventListItem = TEventResponse & {
  soldOut: boolean;
  coverUrl: string | null;
};

export type TEventFilters = IFiltersParams<typeof eventFilters>;

/** Orden pedido al listado de eventos (`order_by=columna:asc|desc`). */
export type TEventOrder = IOrderParams<typeof EVENT_ORDER_COLUMNS>;

/** Productor asignado puntualmente a un evento */
export type TEventProducer = {
  uuid: string;
  userUuid: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: Date;
};

/** Rol de empleado operativo del evento (puerta o caja). */
export type TEventEmployeeRole = 'validator' | 'cashier';

/** Empleado del evento (validador de puerta o caja). */
export type TEventEmployee = {
  uuid: string;
  userUuid: string;
  role: TEventEmployeeRole;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: Date;
};

/** @deprecated Prefer TEventEmployee — listado legacy solo validadores. */
export type TEventValidator = TEventProducer;

/** Usuario candidato a ser asignado como empleado */
export type TUserSummary = {
  uuid: string;
  firstName: string;
  lastName: string;
  email: string;
};

export type TUpsertEventEmployeeInput = {
  role: TEventEmployeeRole;
  userUuid?: string;
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
};

export type TEventMediaItem = {
  uuid: string;
  eventUuid: string;
  sortOrder: number;
  kind: EventMediaKind;
  url: string;
  mimeType: string;
  createdAt: Date;
};


/** Línea de costo de un evento (FP08) */
export type TEventExpense = {
  uuid: string;
  eventUuid: string;
  category: ExpenseCategory;
  concept: string;
  quantity: number | string;
  unitCost: number | string;
  totalAmount: number | string;
  expenseDate: Date | string;
  notes: string | null;
  createdAt: Date;
};

export interface IExpenseCreate {
  category: ExpenseCategory;
  concept: string;
  quantity: number;
  unitCost: number;
  /** YYYY-MM-DD, sin hora */
  expenseDate: string;
  notes?: string;
}

export interface IExpenseUpdate {
  category?: ExpenseCategory;
  concept?: string;
  quantity?: number;
  unitCost?: number;
  expenseDate?: string;
  notes?: string | null;
}

export interface IEventService {
  getEvents(
    pagination: IPaginationParams,
    search: ISearchParams,
    filters: TEventFilters,
    role: string | null,
    options?: { mine?: boolean; loggedUser?: string | null; order?: TEventOrder }
  ): Promise<{ meta: PaginationMetaResponse; items: TEventListItem[] }>;

  getEventById(uuid: string, role?: string | null): Promise<TEventWithTicketTypesResponse>;

  getEventBySlug(slug: string, role?: string | null): Promise<TEventWithTicketTypesResponse>;

  createEvent(data: IEventCreate, loggedUser: string): Promise<{ uuid: string }>;

  updateEvent(uuid: string, data: IEventUpdate, loggedUser: string): Promise<void>;

  /** Historial de cambios (FP10 / `29` §17 / §19). */
  listEventChanges(eventUuid: string, loggedUser: string): Promise<TEventChangesResult>;

  /** Cancela el evento sin borrar ni despublicar (BR-EVENT-010). */
  cancelEvent(
    eventUuid: string,
    loggedUser: string,
    reason?: string | null
  ): Promise<TEventChangeItem>;

  /** Cierre manual de venta — solo Admin (BR-EVENT-013). */
  closeSalesAdmin(eventUuid: string, loggedUser: string): Promise<TEventChangeItem>;

  /**
   * Corta o reabre la venta a mano (`BR-EVENT-013`). Productor dueño o Admin.
   * No es material. Un evento cancelado no se puede reabrir.
   */
  setSalesClosed(eventUuid: string, closed: boolean, loggedUser: string): Promise<Date | null>;

  /**
   * Plazo vigente para pedir reembolso (`BR-REFUND-010`). `endsAt` en null
   * significa que el evento no tuvo ningún cambio material comunicado, que es
   * lo único que habilita el reembolso.
   */
  getRefundWindow(eventUuid: string): Promise<{
    endsAt: Date | null;
    isOpen: boolean;
    extendedTo: Date | null;
    reason: string | null;
  }>;

  /**
   * Extiende ese plazo. **Solo Administrador y solo hacia adelante**: acortarlo
   * sería quitarle al comprador un derecho ya comunicado.
   */
  extendRefundWindow(
    eventUuid: string,
    extendedTo: Date,
    reason: string,
    loggedUser: string
  ): Promise<TEventChangeItem>;

  deleteEvent(uuid: string, loggedUser: string): Promise<boolean>;

  publishEvent(uuid: string, loggedUser: string): Promise<boolean>;

  /** Vuelve el evento a borrador. Bloqueado si ya hay entradas vendidas (pago confirmado). */
  unpublishEvent(uuid: string, loggedUser: string): Promise<boolean>;

  getTicketTypes(eventUuid: string): Promise<TTicketTypeResponse[]>;

  createTicketType(eventUuid: string, data: ITicketTypeCreate, loggedUser: string): Promise<TTicketTypeResponse>;

  updateTicketType(
    eventUuid: string,
    ticketTypeUuid: string,
    data: ITicketTypeUpdate,
    loggedUser: string
  ): Promise<TTicketTypeResponse>;

  /** Alta masiva: una sola request para todas las tandas de un evento. */
  createTicketTypes(
    eventUuid: string,
    items: ITicketTypeCreate[],
    loggedUser: string
  ): Promise<TTicketTypeResponse[]>;

  /** Edicion masiva: cada item lleva el uuid de la tanda que actualiza. */
  updateTicketTypes(
    eventUuid: string,
    items: ITicketTypeBulkUpdate[],
    loggedUser: string
  ): Promise<TTicketTypeResponse[]>;

  deleteTicketType(eventUuid: string, ticketTypeUuid: string, loggedUser: string): Promise<void>;

  /** Baja masiva; falla si alguna tanda del lote tiene ventas. */
  deleteTicketTypes(eventUuid: string, ticketTypeUuids: string[], loggedUser: string): Promise<void>;

  getEventMedia(eventUuid: string, loggedUser?: string | null): Promise<TEventMediaItem[]>;

  uploadEventMedia(eventUuid: string, file: Express.Multer.File, loggedUser: string): Promise<TEventMediaItem>;

  deleteEventMedia(eventUuid: string, mediaUuid: string, loggedUser: string): Promise<void>;

  getFeeSummary(eventUuid: string, loggedUser: string): Promise<EventFeeSummary | null>;

  uploadBanner(
    eventUuid: string,
    variant: BannerVariant,
    file: Express.Multer.File,
    loggedUser: string
  ): Promise<{ variant: BannerVariant; url: string; bannerImages: BannerImages }>;

  deleteBanner(eventUuid: string, variant: BannerVariant, loggedUser: string): Promise<{ bannerImages: BannerImages }>;

  getEventMap(eventUuid: string, loggedUser: string): Promise<TEventMap | null>;

  /** Mapa de solo lectura: publicado = público; borrador = dueño/admin. */
  getEventMapPublic(
    eventUuid: string,
    opts?: { loggedUser?: string | null; role?: string | null }
  ): Promise<TEventMap | null>;

  upsertEventMap(eventUuid: string, data: TUpsertEventMap, loggedUser: string): Promise<TEventMap>;

  uploadMapBaseImage(
    eventUuid: string,
    file: Express.Multer.File,
    loggedUser: string
  ): Promise<TEventMap>;

  setMapBaseFromMedia(eventUuid: string, mediaUuid: string, loggedUser: string): Promise<TEventMap>;

  /** Quita el plano del mapa; devuelve null si el evento no tiene mapa todavia. */
  removeMapBaseImage(eventUuid: string, loggedUser: string): Promise<TEventMap | null>;

  getEventProducers(eventUuid: string, loggedUser: string): Promise<TEventProducer[]>;

  assignProducerToEvent(eventUuid: string, userUuid: string, loggedUser: string): Promise<void>;

  removeProducerFromEvent(eventUuid: string, userUuid: string, loggedUser: string): Promise<void>;

  /** Empleados del evento: validadores + caja, con `role`. */
  getEventEmployees(eventUuid: string, loggedUser: string): Promise<TEventEmployee[]>;

  getEmployeeCandidates(
    eventUuid: string,
    search: string,
    role: TEventEmployeeRole | undefined,
    loggedUser: string
  ): Promise<TUserSummary[]>;

  upsertEventEmployee(
    eventUuid: string,
    data: TUpsertEventEmployeeInput,
    loggedUser: string
  ): Promise<TEventEmployee>;

  removeEventEmployee(
    eventUuid: string,
    userUuid: string,
    role: TEventEmployeeRole,
    loggedUser: string
  ): Promise<void>;

  /** @deprecated Prefer getEventEmployees */
  getEventValidators(eventUuid: string, loggedUser: string): Promise<TEventValidator[]>;

  /** @deprecated Prefer getEmployeeCandidates */
  getValidatorCandidates(eventUuid: string, search: string, loggedUser: string): Promise<TUserSummary[]>;

  /** @deprecated Prefer upsertEventEmployee */
  assignValidatorToEvent(eventUuid: string, userUuid: string, loggedUser: string): Promise<void>;

  /** @deprecated Prefer removeEventEmployee */
  removeValidatorFromEvent(eventUuid: string, userUuid: string, loggedUser: string): Promise<void>;

  getExpenses(
    eventUuid: string,
    loggedUser: string,
    opts?: {
      pagination?: IPaginationParams;
      search?: ISearchParams;
      filters?: IFiltersParams<typeof expenseFilters>;
      order?: IOrderParams<typeof EXPENSE_ORDER_COLUMNS>;
    }
  ): Promise<{
    items: TEventExpense[];
    byCategory: { category: string; total: number }[];
    meta: PaginationMetaResponse;
    total: number;
  }>;

  createExpense(eventUuid: string, data: IExpenseCreate, loggedUser: string): Promise<TEventExpense>;

  updateExpense(
    eventUuid: string,
    expenseUuid: string,
    data: IExpenseUpdate,
    loggedUser: string
  ): Promise<TEventExpense>;

  deleteExpense(eventUuid: string, expenseUuid: string, loggedUser: string): Promise<void>;
}
