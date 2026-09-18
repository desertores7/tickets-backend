import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Between, Like, In, IsNull, LessThan, LessThanOrEqual, MoreThan, MoreThanOrEqual, Not, Or, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { StorageService } from '@root/shared/services/storage.service';
import { DBRepository } from '@config/db/db.repository';
import { RedisService } from '@config/redis/redis.service';
import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { ISearchParams } from '@root/shared/decorators/search-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { UserPermissionService } from '@root/shared/services/userPermissions.service';
import { EventEntity } from '@config/db/entities/tickets/event.entity';
import { EVENT_ORDER_COLUMNS } from '@modules/event/controllers/const/event.filters';
import { EXPENSE_ORDER_COLUMNS, expenseFilters } from '@modules/event/controllers/const/expense.filters';
import { IOrderParams, resolveListOrder } from '@root/shared/decorators/order-query.decorator';
import { IFiltersParams } from '@root/shared/decorators/filter-query.decorator';
import { EventMediaEntity } from '@config/db/entities/tickets/event_media.entity';
import { TicketTypeEntity } from '@config/db/entities/tickets/ticket_type.entity';
import { EventProducerEntity } from '@config/db/entities/tickets/event_producer.entity';
import { EventValidatorEntity } from '@config/db/entities/tickets/event_validator.entity';
import { UserEventCashierEntity } from '@config/db/entities/tickets/user_event_cashier.entity';
import { EventExpenseEntity } from '@config/db/entities/tickets/event_expense.entity';
import { UserOrganizationEntity } from '@config/db/entities/user/user_organization.entity';
import { UserRoleEntity } from '@config/db/entities/user/user_role.entity';
import { UserEntity } from '@config/db/entities/user/user.entity';
import { PASSWORD_POLICY } from '@modules/organization/const/organization-staff.const';
import * as bcryptjs from 'bcryptjs';
import { FeeSummaryService } from '@modules/orders/services/implementation/fee-summary.service';
import { OrderStatus } from '@modules/orders/services/core/order';
import { EventFeeSummary } from '@modules/orders/services/core/fee-summary';
import { ORGANIZATION_STATUS } from '@modules/organization/const/organization-fiscal.const';
import {
  BannerImages,
  BannerVariant
} from '../../controllers/const/banner-variant.const';
import {
  IEventService,
  TEventFilters,
  TEventOrder,
  TEventExpense,
  IExpenseCreate,
  IExpenseUpdate,
  TEventMediaItem,
  TEventMap,
  TEventMapSector,
  TUpsertEventMap,
  TEventProducer,
  TEventEmployee,
  TEventEmployeeRole,
  TUpsertEventEmployeeInput,
  TEventValidator,
  TUserSummary,
  TEventListItem,
  TEventDetailItem,
  TEventResponse,
  TTicketTypeMapSectors,
  TTicketTypeResponse
} from '../contracts/ievent.service';
import { IEventCreate, IEventUpdate, ITicketTypeCreate, ITicketTypeUpdate, ITicketTypeBulkUpdate } from '../core/event';
import { normalizeLineup } from '../core/event-change.helpers';
import { shouldReopenAutoClosedSales } from '../core/event-sales-gate';
import { getTicketTypeSaleWindowError } from '../core/ticket-type-sale-window';
import { normalizeEventContent, normalizeSocialLinks } from '../core/event-social-links';
import { EventChangeService, toEventSnapshot, TEventChangeItem, TEventChangesResult } from './event-change.service';
import { selectCurrentTicketType } from '../core/ticket-sales-policy';
import {
  MAP_GRID_SIZE,
  MapGridError,
  MapGridItem,
  MapSectorLayout,
  assertNoOverlaps,
  isSectorLayout,
  isStageSectorName,
  layoutToLegacyGeometry,
  stageLayoutFromAnalysis,
  validateSectorLayout
} from '../core/map-grid';
import { toGridAnalysis } from '../core/map-grid-analysis';
import { IStockAlertService } from '@modules/stock-alerts/services/contracts/istock-alert.service';
import { EventMapEntity } from '@config/db/entities/tickets/event_map.entity';
import { EventMapSectorEntity } from '@config/db/entities/tickets/event_map_sector.entity';
import { EventMapSectorTicketTypeEntity } from '@config/db/entities/tickets/event_map_sector_ticket_type.entity';
import { buildEventImages } from '../../controllers/responses/event-images.response';

const BANNERS_BASE_PATH = 'events/banners';
const GALLERY_BASE_PATH = 'events/gallery';
const MAPS_BASE_PATH = 'events/maps';
const MAX_GALLERY_ITEMS = 4;
const MAX_GALLERY_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_MAP_BASE_BYTES = 8 * 1024 * 1024;
/** Homónimos del mismo día que numeramos antes de caer al sufijo por timestamp. */
const SLUG_MAX_ATTEMPTS = 50;

@Injectable()
export class EventService implements IEventService {
  constructor(
    @Inject(DBRepository) private readonly dbRepository: DBRepository,
    private readonly redisService: RedisService,
    private readonly userPermission: UserPermissionService,
    private readonly feeSummaryService: FeeSummaryService,
    private readonly storageService: StorageService,
    private readonly eventChangeService: EventChangeService,
    @Inject('IStockAlertService')
    private readonly stockAlertService: IStockAlertService
  ) {}

  // Orden aceptado por el listado de eventos.
  async getEvents(
    pagination: IPaginationParams,
    search: ISearchParams,
    filters: TEventFilters,
    role: string | null,
    options?: { mine?: boolean; loggedUser?: string | null; order?: TEventOrder }
  ): Promise<{ meta: PaginationMetaResponse; items: TEventListItem[] }> {
    const isAdmin = role === 'Administrador';

    const where: Record<string, unknown> = {
      isActive: true,
      name: Like(`%${search.search}%`)
    };

    if (options?.mine) {
      // Vista de backoffice: incluye borradores y eventos pasados.
      // El admin ve todos; un productor ve los de sus organizaciones MÁS los
      // eventos puntuales que le asignaron.
      if (!isAdmin) {
        const [orgUuids, eventUuids] = await Promise.all([
          this.getUserOrganizationUuids(options.loggedUser),
          this.getAssignedEventUuids(options.loggedUser)
        ]);

        if (orgUuids.length === 0 && eventUuids.length === 0) {
          const meta = new PaginationMetaResponse({ limit: pagination.limit, page: pagination.page, total: 0 });
          return { meta, items: [] };
        }

        // Se arma un OR: TypeORM lo expresa como array de condiciones
        const scoped: Record<string, unknown>[] = [];
        if (orgUuids.length > 0) scoped.push({ ...where, organizationUuid: In(orgUuids) });
        if (eventUuids.length > 0) scoped.push({ ...where, uuid: In(eventUuids) });

        return this.runEventsQuery(scoped, filters, pagination, options?.order);
      }
    } else {
      // Vista pública: solo publicados, no cancelados, y que todavía no terminaron.
      // Se filtra por endDate (no startDate) para que un evento en curso siga visible.
      where['isPublished'] = true;
      where['cancelledAt'] = IsNull();
      where['endDate'] = MoreThanOrEqual(new Date());
      // `BR-PROD-006`: los eventos de una productora suspendida se ocultan del
      // público. No se borran ni se despublican — al reactivarla vuelven solos.
      where['organization'] = { active: 1 };
    }

    const scopedWhere = this.applyEventFilters(where, filters);

    const result = await this.dbRepository.findManyAndCount({
      entity: 'event',
      where: scopedWhere as any,
      other: {
        take: pagination.limit,
        skip: (pagination.page - 1) * pagination.limit,
        order: this.resolveEventOrder(options?.order)
      }
    });

    const meta = new PaginationMetaResponse({
      limit: pagination.limit,
      page: pagination.page,
      total: result.count
    });

    return { meta, items: await this.attachSoldOut(result.items as TEventResponse[]) };
  }

  /**
   * Oculta la ficha cuando la productora está suspendida (`BR-PROD-006`).
   *
   * Filtrar el listado no alcanza: el link directo a la ficha sigue andando y
   * es lo que la gente tiene guardado. Solo el equipo interno y las productoras
   * la siguen viendo, porque necesitan el backoffice.
   */
  private assertOrganizationOperating(
    organization: { active?: number } | null | undefined,
    role?: string | null
  ): void {
    if (organization?.active !== 0) return;
    if (role === 'Administrador' || role === 'Productor') return;
    throw new BadRequestException('Evento no encontrado');
  }

  async getEventById(uuid: string, role?: string | null): Promise<TEventDetailItem> {
    const event = await this.dbRepository.findOne({
      entity: 'event',
      where: { uuid, isActive: true },
      relations: { organization: true }
    });

    if (!event) throw new BadRequestException('Evento no encontrado');

    // Los borradores no se exponen a visitantes anónimos (endpoint público).
    // Los usuarios autenticados mantienen el acceso: el backoffice los necesita.
    if (!event.isPublished && !role) throw new BadRequestException('Evento no encontrado');
    this.assertOrganizationOperating(event.organization, role);

    return this.withEventImages(event as TEventResponse);
  }

  async getEventBySlug(slug: string, role?: string | null): Promise<TEventDetailItem> {
    const normalized = (slug ?? '').trim();
    if (!normalized) throw new BadRequestException('Evento no encontrado');

    const event = await this.dbRepository.findOne({
      entity: 'event',
      where: { slug: normalized, isActive: true },
      relations: { organization: true }
    });

    if (!event) throw new BadRequestException('Evento no encontrado');
    if (!event.isPublished && !role) throw new BadRequestException('Evento no encontrado');
    this.assertOrganizationOperating(event.organization, role);

    return this.withEventImages(event as TEventResponse);
  }

  /**
   * Slug libre a partir del deseado: `nombre-dd-mm-yyyy`, `…-2`, `…-3`…
   *
   * El productor no elige el slug (sale del título y la fecha), así que un
   * choque no es un error suyo: dos fiestas distintas pueden llamarse igual el
   * mismo día, y reanalizar el mismo flyer produce exactamente el mismo slug.
   * Fallar ahí deja un borrador que no se puede guardar por un campo que la UI
   * ni muestra.
   */
  private async resolveAvailableSlug(desired: string, excludeUuid?: string): Promise<string> {
    const base = (desired ?? '').trim().slice(0, 240) || 'evento';
    for (let attempt = 1; attempt <= SLUG_MAX_ATTEMPTS; attempt++) {
      const candidate = attempt === 1 ? base : `${base}-${attempt}`;
      const taken = await this.dbRepository.findOne({
        entity: 'event',
        where: { slug: candidate }
      });
      if (!taken || (excludeUuid && taken.uuid === excludeUuid)) return candidate;
    }
    // Caso patológico (más de SLUG_MAX_ATTEMPTS homónimos el mismo día).
    return `${base}-${Date.now().toString(36)}`;
  }

  async createEvent(data: IEventCreate, loggedUser: string): Promise<{ uuid: string }> {
    const org = await this.dbRepository.findOne({
      entity: 'organization',
      where: { uuid: data.organizationUuid, isDeleted: IsNull() }
    });
    if (!org) throw new BadRequestException('Organización no encontrada');

    if (org.organizationStatusUuid !== ORGANIZATION_STATUS.APPROVED.uuid) {
      throw new ForbiddenException(
        'La productora debe estar aprobada para crear eventos. Completá y enviá la validación fiscal.'
      );
    }

    await this.assertOrganizationMembership(data.organizationUuid, loggedUser);

    this.assertDateCoherence(data);
    if (new Date(data.endDate) <= new Date()) {
      throw new BadRequestException('La fecha de fin del evento debe ser futura');
    }

    // El slug lo deriva el frontend de título + fecha, así que dos eventos con el
    // mismo nombre el mismo día chocan solos. Al productor no se le puede pedir
    // que resuelva un choque de slugs que nunca vio: se numera y sigue.
    const slug = await this.resolveAvailableSlug(data.slug);

    const event = new EventEntity();
    event.uuid = uuidv4();
    event.name = data.name;
    event.description = data.description ?? null;
    event.content = normalizeEventContent(data.content);
    event.socialLinks = normalizeSocialLinks(data.socialLinks);
    event.slug = slug;
    event.bannerUrl = data.bannerUrl ?? null;
    event.startDate = data.startDate;
    event.endDate = data.endDate;
    event.saleStartDate = data.saleStartDate ?? null;
    event.saleEndDate = data.saleEndDate ?? null;
    event.isPublished = false;
    event.isActive = true;
    event.organizationUuid = data.organizationUuid;
    event.venueName = data.venueName?.trim() ?? '';
    event.venueAddress = data.venueAddress?.trim() ?? '';
    event.venueCity = data.venueCity?.trim() ?? '';
    event.venueCountry = data.venueCountry?.trim() ?? '';
    event.venuePostalCode = data.venuePostalCode?.trim() ?? '';
    event.googleMapsUrl = data.googleMapsUrl ?? null;
    event.maxCapacity = data.maxCapacity;

    await this.dbRepository.create({ entity: 'event', data: event });
    return { uuid: event.uuid };
  }

  async updateEvent(uuid: string, data: IEventUpdate, loggedUser: string): Promise<void> {
    const event = await this.assertOwnership(uuid, loggedUser);
    const snapshot = toEventSnapshot(event as EventEntity);

    // Se valida el resultado del merge: un update parcial puede dejar fechas
    // incoherentes contra valores que no vinieron en el request.
    const merged = {
      startDate: data.startDate ?? event.startDate,
      endDate: data.endDate ?? event.endDate,
      saleStartDate: data.saleStartDate !== undefined ? data.saleStartDate : event.saleStartDate,
      saleEndDate: data.saleEndDate !== undefined ? data.saleEndDate : event.saleEndDate
    };
    this.assertDateCoherence(merged);

    // Un evento vigente no puede pasar a tener fin en el pasado. Si ya terminó,
    // se permite editarlo igual (corrección de datos históricos).
    const alreadyFinished = new Date(event.endDate) <= new Date();
    if (!alreadyFinished && new Date(merged.endDate) <= new Date()) {
      throw new BadRequestException('La fecha de fin del evento debe ser futura');
    }

    const patch: Partial<EventEntity> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.content !== undefined) patch.content = normalizeEventContent(data.content);
    if (data.socialLinks !== undefined) patch.socialLinks = normalizeSocialLinks(data.socialLinks);
    if (data.bannerUrl !== undefined) patch.bannerUrl = data.bannerUrl;
    if (data.startDate !== undefined) patch.startDate = data.startDate;
    if (data.endDate !== undefined) patch.endDate = data.endDate;
    if (data.saleStartDate !== undefined) patch.saleStartDate = data.saleStartDate;
    if (data.saleEndDate !== undefined) patch.saleEndDate = data.saleEndDate;
    if (data.venueName !== undefined) patch.venueName = data.venueName;
    if (data.venueAddress !== undefined) patch.venueAddress = data.venueAddress;
    if (data.venueCity !== undefined) patch.venueCity = data.venueCity;
    if (data.venueCountry !== undefined) patch.venueCountry = data.venueCountry;
    if (data.venuePostalCode !== undefined) patch.venuePostalCode = data.venuePostalCode;
    if (data.googleMapsUrl !== undefined) patch.googleMapsUrl = data.googleMapsUrl;
    if (data.maxCapacity !== undefined) patch.maxCapacity = data.maxCapacity;
    if (data.lineup !== undefined) {
      const normalized = normalizeLineup(data.lineup);
      patch.lineup = normalized.length ? normalized : null;
    }

    if (data.slug !== undefined && data.slug !== event.slug) {
      patch.slug = await this.resolveAvailableSlug(data.slug, event.uuid);
    }

    if (Object.keys(patch).length) {
      await this.dbRepository.update({ entity: 'event', where: { uuid: event.uuid }, data: patch });
    }

    // La venta solo se corta cuando el evento terminó: si el job ya la había
    // cerrado y ahora el fin pasa a futuro, se reabre.
    if (shouldReopenAutoClosedSales(event, data.endDate)) {
      await this.eventChangeService.reopenAutoClosedSales(event as EventEntity, loggedUser);
    }

    // Historial + email/ventana de reembolso si el cambio es material y hay
    // ventas (FP10). Los emails van en background: no bloquean el PATCH.
    await this.eventChangeService.recordUpdateChanges(
      snapshot,
      {
        startDate: data.startDate,
        endDate: data.endDate,
        venueName: data.venueName,
        venueAddress: data.venueAddress,
        venueCity: data.venueCity,
        venueCountry: data.venueCountry,
        venuePostalCode: data.venuePostalCode,
        googleMapsUrl: data.googleMapsUrl,
        description: data.description,
        content: data.content !== undefined ? patch.content : undefined,
        socialLinks: data.socialLinks !== undefined ? normalizeSocialLinks(data.socialLinks) : undefined,
        lineup: data.lineup !== undefined ? (patch.lineup as string[] | null) : undefined
      },
      loggedUser
    );
  }

  async listEventChanges(eventUuid: string, loggedUser: string): Promise<TEventChangesResult> {
    return this.eventChangeService.listChanges(eventUuid, loggedUser);
  }

  async cancelEvent(
    eventUuid: string,
    loggedUser: string,
    reason?: string | null
  ): Promise<TEventChangeItem> {
    return this.eventChangeService.cancelEvent(eventUuid, loggedUser, reason);
  }

  async getRefundWindow(eventUuid: string): Promise<{
    endsAt: Date | null;
    isOpen: boolean;
    extendedTo: Date | null;
    reason: string | null;
  }> {
    return this.eventChangeService.getRefundWindow(eventUuid);
  }

  async extendRefundWindow(
    eventUuid: string,
    extendedTo: Date,
    reason: string,
    loggedUser: string
  ): Promise<TEventChangeItem> {
    return this.eventChangeService.extendRefundWindow(eventUuid, extendedTo, reason, loggedUser);
  }

  async closeSalesAdmin(eventUuid: string, loggedUser: string): Promise<TEventChangeItem> {
    return this.eventChangeService.closeSalesAdmin(eventUuid, loggedUser);
  }

  async setSalesClosed(
    eventUuid: string,
    closed: boolean,
    loggedUser: string
  ): Promise<Date | null> {
    return this.eventChangeService.setSalesClosed(eventUuid, closed, loggedUser);
  }

  async deleteEvent(uuid: string, loggedUser: string): Promise<boolean> {
    const event = await this.assertOwnership(uuid, loggedUser);
    await this.dbRepository.update({ entity: 'event', where: { uuid: event.uuid }, data: { isActive: false } });
    return true;
  }

  async publishEvent(uuid: string, loggedUser: string): Promise<boolean> {
    const event = await this.assertOwnership(uuid, loggedUser);

    if (event.isPublished) throw new BadRequestException('El evento ya está publicado');

    const hasTicketTypes = await this.dbRepository.count({
      entity: 'ticket_type',
      where: { eventUuid: event.uuid, isActive: true }
    });
    if (!hasTicketTypes) throw new BadRequestException('El evento debe tener al menos un tipo de entrada para publicarse');

    // Publicar sin stock deja el evento en cartelera sin nada que comprar. Se
    // separa del chequeo anterior para poder decir cuál de los dos falta.
    const hasStock = await this.dbRepository.count({
      entity: 'ticket_type',
      where: { eventUuid: event.uuid, isActive: true, availableQuantity: MoreThan(0) }
    });
    if (!hasStock) {
      throw new BadRequestException(
        'Ningún tipo de entrada tiene disponibilidad. Cargá stock antes de publicar el evento'
      );
    }

    // publishedAt marca el momento real de salida a la venta: es lo que usa el
    // frontend para destacar los "nuevos shows".
    await this.dbRepository.update({
      entity: 'event',
      where: { uuid: event.uuid },
      data: { isPublished: true, publishedAt: new Date() }
    });
    return true;
  }

  async unpublishEvent(uuid: string, loggedUser: string): Promise<boolean> {
    const event = await this.assertOwnership(uuid, loggedUser);

    if (!event.isPublished) {
      throw new BadRequestException('El evento ya está en borrador');
    }

    // No se permite ocultar un evento con ventas: parecería una estafa para
    // quien ya compró.
    //
    // La prueba de venta son las órdenes pagadas, no el stock. Comparar
    // `quantity > availableQuantity` daba falsos positivos permanentes: al dar
    // de baja una tanda se la deja en `availableQuantity: 0` con `quantity`
    // intacto, y esta consulta ni siquiera filtraba por `isActive`, así que
    // cualquier evento que hubiera regenerado el mapa —lo que borra y recrea
    // las tandas— quedaba marcado como vendido para siempre, sin una sola
    // orden. Una orden pagada es además lo mismo que ve el productor en
    // Ingresos, así que el mensaje deja de contradecir a la pantalla.
    const paidOrders = await this.dbRepository.count({
      entity: 'orders',
      where: { eventUuid: event.uuid, status: OrderStatus.PAID }
    });

    if (paidOrders > 0) {
      throw new BadRequestException(
        'No se puede pasar a borrador: ya hay entradas vendidas. El evento debe seguir público.'
      );
    }

    await this.dbRepository.update({
      entity: 'event',
      where: { uuid: event.uuid },
      data: { isPublished: false, publishedAt: null }
    });
    return true;
  }

  async getTicketTypes(eventUuid: string): Promise<TTicketTypeResponse[]> {
    const event = await this.dbRepository.findOne({
      entity: 'event',
      where: { uuid: eventUuid, isActive: true }
    });
    if (!event) throw new BadRequestException('Evento no encontrado');

    return this.dbRepository.findMany({
      entity: 'ticket_type',
      where: { eventUuid, isActive: true },
      other: { order: { sortOrder: 'ASC' } }
    }) as Promise<TTicketTypeResponse[]>;
  }

  async createTicketType(eventUuid: string, data: ITicketTypeCreate, loggedUser: string): Promise<TTicketTypeResponse> {
    const event = await this.assertOwnership(eventUuid, loggedUser);
    this.assertTicketTypeSaleWindow(event, data);
    return this.persistNewTicketType(event.uuid, data);
  }

  /**
   * Alta masiva. La verificacion de permisos se hace una sola vez para todo el
   * lote: el alta de un evento con 50 tandas es una request, no 50.
   */
  async createTicketTypes(
    eventUuid: string,
    items: ITicketTypeCreate[],
    loggedUser: string
  ): Promise<TTicketTypeResponse[]> {
    const event = await this.assertOwnership(eventUuid, loggedUser);

    // Todo el lote antes de crear nada: si la tercera falla, que no queden
    // creadas las dos primeras.
    for (const data of items) this.assertTicketTypeSaleWindow(event, data);

    const created: TTicketTypeResponse[] = [];
    for (const data of items) {
      created.push(await this.persistNewTicketType(event.uuid, data));
    }
    return created;
  }

  /** Ventana de venta de la entrada dentro del evento. Ver `getTicketTypeSaleWindowError`. */
  private assertTicketTypeSaleWindow(
    event: { endDate: Date | string },
    window: { saleStartDate?: Date | string | null; saleEndDate?: Date | string | null }
  ): void {
    const error = getTicketTypeSaleWindowError(event, window);
    if (error) throw new BadRequestException(error);
  }

  private async persistNewTicketType(eventUuid: string, data: ITicketTypeCreate): Promise<TTicketTypeResponse> {
    const ticketType = new TicketTypeEntity();
    ticketType.uuid = uuidv4();
    ticketType.eventUuid = eventUuid;
    ticketType.name = data.name;
    ticketType.description = data.description ?? null;
    ticketType.price = data.price;
    ticketType.currency = data.currency ?? 'ARS';
    ticketType.quantity = data.quantity;
    ticketType.availableQuantity = data.quantity;
    ticketType.minPerOrder = data.minPerOrder ?? 1;
    ticketType.maxPerOrder = data.maxPerOrder ?? 10;
    ticketType.saleStartDate = data.saleStartDate ?? null;
    ticketType.saleEndDate = data.saleEndDate ?? null;
    ticketType.isActive = true;
    ticketType.salesEnabled = true;
    ticketType.sortOrder = data.sortOrder ?? 0;

    const saved = await this.dbRepository.create({ entity: 'ticket_type', data: ticketType });

    await this.redisService.setStock(`stock:${saved.uuid}`, data.quantity);
    await this.stockAlertService.ensureDefaultForTicketType(eventUuid, saved.uuid);

    return saved as TTicketTypeResponse;
  }

  async updateTicketType(
    eventUuid: string,
    ticketTypeUuid: string,
    data: ITicketTypeUpdate,
    loggedUser: string
  ): Promise<TTicketTypeResponse> {
    await this.assertOwnership(eventUuid, loggedUser);
    return this.applyTicketTypeUpdate(eventUuid, ticketTypeUuid, data, loggedUser);
  }

  async setTicketTypeSalesState(
    eventUuid: string,
    ticketTypeUuid: string,
    enabled: boolean,
    loggedUser: string
  ): Promise<TTicketTypeResponse> {
    await this.assertOwnership(eventUuid, loggedUser);
    const ticketType = await this.dbRepository.findOne({
      entity: 'ticket_type',
      where: { uuid: ticketTypeUuid, eventUuid, isActive: true }
    });
    if (!ticketType) throw new BadRequestException('Tipo de entrada no encontrado');

    if (ticketType.salesEnabled !== enabled) {
      await this.dbRepository.update({
        entity: 'ticket_type',
        where: { uuid: ticketTypeUuid },
        data: { salesEnabled: enabled }
      });
    }

    return {
      ...ticketType,
      salesEnabled: enabled
    } as TTicketTypeResponse;
  }

  /**
   * Edicion masiva. Mismo criterio que el alta: un solo chequeo de permisos y
   * una sola request para todas las tandas tocadas.
   */
  async updateTicketTypes(
    eventUuid: string,
    items: ITicketTypeBulkUpdate[],
    loggedUser: string
  ): Promise<TTicketTypeResponse[]> {
    await this.assertOwnership(eventUuid, loggedUser);

    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.uuid)) {
        throw new BadRequestException(`La tanda ${item.uuid} viene repetida en el lote`);
      }
      seen.add(item.uuid);
    }

    const updated: TTicketTypeResponse[] = [];
    for (const { uuid, ...patch } of items) {
      updated.push(await this.applyTicketTypeUpdate(eventUuid, uuid, patch, loggedUser));
    }
    return updated;
  }

  private async applyTicketTypeUpdate(
    eventUuid: string,
    ticketTypeUuid: string,
    data: ITicketTypeUpdate,
    loggedUser: string
  ): Promise<TTicketTypeResponse> {
    const ticketType = await this.dbRepository.findOne({
      entity: 'ticket_type',
      where: { uuid: ticketTypeUuid, eventUuid, isActive: true }
    });
    if (!ticketType) throw new BadRequestException('Tipo de entrada no encontrado');

    const soldCount = ticketType.quantity - ticketType.availableQuantity;
    const previousQuantity = ticketType.quantity;

    // Se valida la ventana final (lo guardado + lo que cambia): mover solo el
    // inicio también puede dejarla incoherente con un fin que no vino.
    if (data.saleStartDate !== undefined || data.saleEndDate !== undefined) {
      const event = await this.dbRepository.findOne({ entity: 'event', where: { uuid: eventUuid } });
      if (event) {
        this.assertTicketTypeSaleWindow(event, {
          saleStartDate: data.saleStartDate !== undefined ? data.saleStartDate : ticketType.saleStartDate,
          saleEndDate: data.saleEndDate !== undefined ? data.saleEndDate : ticketType.saleEndDate
        });
      }
    }

    const patch: Partial<TicketTypeEntity> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.minPerOrder !== undefined) patch.minPerOrder = data.minPerOrder;
    if (data.maxPerOrder !== undefined) patch.maxPerOrder = data.maxPerOrder;
    if (data.saleStartDate !== undefined) patch.saleStartDate = data.saleStartDate;
    if (data.saleEndDate !== undefined) patch.saleEndDate = data.saleEndDate;
    if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder;

    if (data.price !== undefined) {
      if (soldCount > 0) {
        throw new BadRequestException(
          'No se puede cambiar el precio de una tanda con ventas. Agotá la tanda y creá una nueva.'
        );
      }
      patch.price = data.price;
    }

    if (data.quantity !== undefined) {
      if (data.quantity < soldCount) {
        throw new BadRequestException(
          `El stock no puede ser menor a lo ya vendido (${soldCount})`
        );
      }
      const delta = data.quantity - ticketType.quantity;
      patch.quantity = data.quantity;
      patch.availableQuantity = ticketType.availableQuantity + delta;
    }

    await this.dbRepository.update({ entity: 'ticket_type', where: { uuid: ticketTypeUuid }, data: patch });

    if (data.quantity !== undefined && patch.availableQuantity !== undefined) {
      await this.redisService.setStock(`stock:${ticketTypeUuid}`, patch.availableQuantity);
      await this.eventChangeService.recordStockChange({
        eventUuid,
        ticketTypeUuid,
        ticketTypeName: ticketType.name,
        beforeQuantity: previousQuantity,
        afterQuantity: data.quantity,
        loggedUser
      });
    }

    return this.dbRepository.findOne({
      entity: 'ticket_type',
      where: { uuid: ticketTypeUuid }
    }) as Promise<TTicketTypeResponse>;
  }

  async deleteTicketType(eventUuid: string, ticketTypeUuid: string, loggedUser: string): Promise<void> {
    await this.assertOwnership(eventUuid, loggedUser);
    return this.deactivateTicketType(eventUuid, ticketTypeUuid);
  }

  /**
   * Baja masiva. La usa la regeneracion del mapa: al reemplazarlo hay que
   * limpiar de una sola vez las tandas del mapa anterior.
   */
  async deleteTicketTypes(eventUuid: string, ticketTypeUuids: string[], loggedUser: string): Promise<void> {
    await this.assertOwnership(eventUuid, loggedUser);
    for (const uuid of new Set(ticketTypeUuids)) {
      await this.deactivateTicketType(eventUuid, uuid);
    }
  }

  private async deactivateTicketType(eventUuid: string, ticketTypeUuid: string): Promise<void> {

    const ticketType = await this.dbRepository.findOne({
      entity: 'ticket_type',
      where: { uuid: ticketTypeUuid, eventUuid, isActive: true }
    });
    if (!ticketType) throw new BadRequestException('Tipo de entrada no encontrado');

    const soldCount = ticketType.quantity - ticketType.availableQuantity;
    if (soldCount > 0) {
      throw new BadRequestException('No se puede eliminar una tanda con ventas');
    }

    await this.dbRepository.update({
      entity: 'ticket_type',
      where: { uuid: ticketTypeUuid },
      data: { isActive: false, availableQuantity: 0 }
    });
    await this.redisService.setStock(`stock:${ticketTypeUuid}`, 0);
  }

  async getEventMedia(eventUuid: string, loggedUser?: string | null): Promise<TEventMediaItem[]> {
    const event = await this.dbRepository.findOne({
      entity: 'event',
      where: { uuid: eventUuid, isActive: true }
    });
    if (!event) throw new BadRequestException('Evento no encontrado');

    if (!event.isPublished) {
      if (!loggedUser) throw new BadRequestException('Evento no encontrado');
      await this.assertOwnership(eventUuid, loggedUser, { readOnly: true });
    }

    const rows = await this.dbRepository.findMany({
      entity: 'event_media',
      where: { eventUuid, isDeleted: IsNull() },
      other: { order: { sortOrder: 'ASC', createdAt: 'ASC' } }
    });

    return rows.map(row => ({
      uuid: row.uuid,
      eventUuid: row.eventUuid,
      sortOrder: row.sortOrder,
      kind: row.kind,
      url: this.storageService.toPublicUrl(row.url) ?? row.url,
      mimeType: row.mimeType,
      createdAt: row.createdAt
    }));
  }

  async uploadEventMedia(
    eventUuid: string,
    file: Express.Multer.File,
    loggedUser: string
  ): Promise<TEventMediaItem> {
    const event = await this.assertOwnership(eventUuid, loggedUser);

    if (!file?.buffer?.length) {
      throw new BadRequestException('No se recibió ningún archivo');
    }
    if (file.size > MAX_GALLERY_UPLOAD_BYTES) {
      throw new BadRequestException('El archivo supera el máximo de 20 MB');
    }

    const isImage = file.mimetype?.startsWith('image/');
    const isVideo = file.mimetype?.startsWith('video/');
    if (!isImage && !isVideo) {
      throw new BadRequestException('Solo se permiten imágenes o videos');
    }

    const activeCount = await this.dbRepository.count({
      entity: 'event_media',
      where: { eventUuid: event.uuid, isDeleted: IsNull() }
    });
    if (activeCount >= MAX_GALLERY_ITEMS) {
      throw new BadRequestException(`La galería admite hasta ${MAX_GALLERY_ITEMS} archivos`);
    }

    const relativePath = `${GALLERY_BASE_PATH}/${event.uuid}`;
    let url: string;
    let mimeType = file.mimetype;
    let kind: 'image' | 'video' = isVideo ? 'video' : 'image';

    if (isImage) {
      let processed: Buffer;
      try {
        processed = await sharp(file.buffer)
          .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();
      } catch {
        throw new BadRequestException('El archivo no es una imagen válida');
      }
      const filename = `gallery-${Date.now()}.webp`;
      ({ url } = await this.storageService.saveFile({ buffer: processed, relativePath, filename }));
      mimeType = 'image/webp';
    } else {
      const ext = (file.originalname.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
      const filename = `gallery-${Date.now()}.${ext}`;
      ({ url } = await this.storageService.saveFile({ buffer: file.buffer, relativePath, filename }));
    }

    const media = new EventMediaEntity();
    media.uuid = uuidv4();
    media.eventUuid = event.uuid;
    media.sortOrder = activeCount;
    media.kind = kind;
    media.url = url;
    media.mimeType = mimeType;
    media.isDeleted = null;
    media.createdBy = loggedUser;

    await this.dbRepository.create({ entity: 'event_media', data: media });

    return {
      uuid: media.uuid,
      eventUuid: media.eventUuid,
      sortOrder: media.sortOrder,
      kind: media.kind,
      url: this.storageService.toPublicUrl(media.url) ?? media.url,
      mimeType: media.mimeType,
      createdAt: media.createdAt ?? new Date()
    };
  }

  async deleteEventMedia(eventUuid: string, mediaUuid: string, loggedUser: string): Promise<void> {
    const event = await this.assertOwnership(eventUuid, loggedUser);

    const media = await this.dbRepository.findOne({
      entity: 'event_media',
      where: { uuid: mediaUuid, eventUuid, isDeleted: IsNull() }
    });
    if (!media) throw new BadRequestException('Archivo de galería no encontrado');

    await this.dbRepository.update({
      entity: 'event_media',
      where: { uuid: mediaUuid },
      data: { isDeleted: new Date() }
    });

    // Si el mismo archivo se usa como banner, no borrar el disco: quitar el flyer
    // de la galería no debe dejar el banner roto.
    const banners = (event.bannerImages as BannerImages) ?? {};
    const bannerUrls = [event.bannerUrl, banners.desktop, banners.mobile, banners.thumbnail].filter(
      (u): u is string => Boolean(u?.trim())
    );
    if (bannerUrls.some(b => this.storageService.sameStaticAsset(media.url, b))) {
      return;
    }

    const mediaPath = this.storageService.staticPathname(media.url);
    if (mediaPath?.includes(`/static/${GALLERY_BASE_PATH}/${eventUuid}/`)) {
      const filename = mediaPath.split('/').pop();
      if (filename) {
        await this.storageService.deleteFile(
          this.storageService.resolveAbsolutePath(`${GALLERY_BASE_PATH}/${eventUuid}`, filename)
        );
      }
    }
  }

  async getFeeSummary(eventUuid: string, loggedUser: string): Promise<EventFeeSummary | null> {
    // Autoriza: solo el organizador dueño del evento o un admin. Lanza si no.
    await this.assertOwnership(eventUuid, loggedUser, { readOnly: true });
    // Puede ser null si el evento todavía no tiene ventas pagadas — el caller
    // (DTO) mapea null a ceros en lugar de 404.
    return this.feeSummaryService.getSummaryByEvent(eventUuid);
  }

  async uploadBanner(
    eventUuid: string,
    variant: BannerVariant,
    file: Express.Multer.File,
    loggedUser: string
  ): Promise<{ variant: BannerVariant; url: string; bannerImages: BannerImages }> {
    const event = await this.assertOwnership(eventUuid, loggedUser);

    if (!file?.buffer?.length) {
      throw new BadRequestException('No se recibió ningún archivo');
    }
    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Solo se permiten imágenes (jpg, png, webp, etc.)');
    }

    // Validar que sea imagen real; NO redimensionar ni croppear — se guarda
    // el mismo buffer que llegó (p. ej. hero 16:9 de la IA) para no perder composición.
    let meta: sharp.Metadata;
    try {
      meta = await sharp(file.buffer).metadata();
    } catch {
      throw new BadRequestException('El archivo no es una imagen válida');
    }
    if (!meta.width || !meta.height) {
      throw new BadRequestException('El archivo no es una imagen válida');
    }

    const ext = this.bannerFileExtension(file.mimetype, meta.format);
    const relativePath = `${BANNERS_BASE_PATH}/${event.uuid}`;
    const filename = `${variant}-${Date.now()}.${ext}`;

    const { url } = await this.storageService.saveFile({
      buffer: file.buffer,
      relativePath,
      filename
    });

    const current: BannerImages = (event.bannerImages as BannerImages) ?? {};
    const previousUrl = current[variant];

    const bannerImages: BannerImages = { ...current, [variant]: url };

    await this.dbRepository.update({
      entity: 'event',
      where: { uuid: event.uuid },
      // bannerUrl sigue apuntando a desktop para no romper consumidores existentes
      data: {
        bannerImages,
        ...(variant === 'desktop' ? { bannerUrl: url } : {})
      }
    });

    await this.removeStoredBanner(event.uuid, previousUrl);

    return {
      variant,
      url: this.storageService.toPublicUrl(url) ?? url,
      bannerImages: this.publicBannerImages(bannerImages)
    };
  }

  /** Extensión de archivo alineada al mime/format detectado (sin re-encode). */
  private bannerFileExtension(
    mimeType: string | undefined,
    format: string | undefined
  ): 'png' | 'webp' | 'jpg' | 'gif' {
    const mime = (mimeType ?? '').toLowerCase();
    if (mime.includes('png') || format === 'png') return 'png';
    if (mime.includes('webp') || format === 'webp') return 'webp';
    if (mime.includes('gif') || format === 'gif') return 'gif';
    if (mime.includes('jpeg') || mime.includes('jpg') || format === 'jpeg') return 'jpg';
    return 'png';
  }

  async deleteBanner(
    eventUuid: string,
    variant: BannerVariant,
    loggedUser: string
  ): Promise<{ bannerImages: BannerImages }> {
    const event = await this.assertOwnership(eventUuid, loggedUser);

    const current: BannerImages = (event.bannerImages as BannerImages) ?? {};
    const targetUrl = current[variant];

    if (!targetUrl) {
      throw new BadRequestException(`El evento no tiene imagen para la variante "${variant}"`);
    }

    const bannerImages: BannerImages = { ...current };
    delete bannerImages[variant];

    await this.dbRepository.update({
      entity: 'event',
      where: { uuid: event.uuid },
      data: {
        bannerImages,
        ...(variant === 'desktop' ? { bannerUrl: null } : {})
      }
    });

    await this.removeStoredBanner(event.uuid, targetUrl);

    return { bannerImages: this.publicBannerImages(bannerImages) };
  }

  async getEventMap(eventUuid: string, loggedUser: string): Promise<TEventMap> {
    await this.assertOwnership(eventUuid, loggedUser, { readOnly: true });
    const map = await this.dbRepository.findOne({
      entity: 'event_map',
      where: { eventUuid }
    });
    return this.loadEventMapBundle(eventUuid, map);
  }

  async getEventMapPublic(
    eventUuid: string,
    opts?: { loggedUser?: string | null; role?: string | null }
  ): Promise<TEventMap & { isPublic: boolean }> {
    const event = await this.dbRepository.findOne({
      entity: 'event',
      where: { uuid: eventUuid, isActive: true }
    });
    if (!event) throw new BadRequestException('Evento no encontrado');

    if (!event.isPublished) {
      if (!opts?.loggedUser) throw new BadRequestException('Evento no encontrado');
      await this.assertOwnership(eventUuid, opts.loggedUser, { readOnly: true });
    }

    const map = await this.dbRepository.findOne({
      entity: 'event_map',
      where: { eventUuid }
    });
    const bundle = await this.loadEventMapBundle(eventUuid, map);
    return { ...bundle, isPublic: !!event.isPublished };
  }

  /**
   * Guarda el mapa completo: metadatos + reemplazo de la lista de sectores.
   *
   * Todas las escrituras van por UN QueryRunner, dentro de UNA transacción, por
   * dos motivos distintos:
   *
   *  - Atomicidad. El reemplazo de sectores es DELETE + INSERT. Sin transacción,
   *    un error entre los dos dejaba el mapa del productor vacío: los sectores
   *    borrados y los nuevos sin insertar, sin vuelta atrás.
   *
   *  - Conexiones. Cada método del repositorio toma una conexión del pool por
   *    su cuenta, así que un guardado disparaba una decena de conexiones nuevas
   *    a la vez. Con MySQL fuera del contenedor, abrir una conexión cuesta
   *    bastante más que la consulta que va a correr por ella, y ese costo se
   *    paga entero en el primer guardado después de un rato de inactividad
   *    —cuando el pool está frío— mientras que el segundo, con las conexiones
   *    ya abiertas, tarda una fracción. Es la diferencia entre 17 s y 1 s sobre
   *    el mismo payload.
   *
   * La respuesta se arma con lo que se acaba de escribir en vez de releer el
   * mapa: los sectores y los vínculos ya están en memoria, y releerlos eran
   * tres consultas más para devolver exactamente lo mismo.
   */
  async upsertEventMap(eventUuid: string, input: TUpsertEventMap, loggedUser: string): Promise<TEventMap> {
    const data = this.extractStageSector(input);
    const event = await this.assertOwnership(eventUuid, loggedUser);
    this.assertUniqueSectorNames(data.sectors);
    await this.validateSectorTicketTypes(event.uuid, data.sectors);

    const existing = await this.dbRepository.findOne({
      entity: 'event_map',
      where: { eventUuid: event.uuid }
    });

    // La grilla se valida entera ANTES de abrir la transacción: un layout
    // inválido o un solape es un 400, no un rollback.
    const grid = this.resolveMapGrid(data, existing);
    // Se persiste solo la forma canónica en celdas (sin box/outline/pesos).
    const analysisToStore: Record<string, unknown> | null | undefined =
      data.analysis === undefined
        ? undefined
        : toGridAnalysis(data.analysis, { stageLayout: grid.stageLayout });

    const queryRunner = this.dbRepository.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let map: {
      uuid: string;
      eventUuid: string;
      name: string;
      baseImageUrl: string | null;
      canvasWidth: number;
      canvasHeight: number;
      analysis: Record<string, unknown> | null;
      stageLayout: MapSectorLayout;
      needsReanalysis: boolean;
    };
    let sectors: TEventMapSector[];

    try {
      if (!existing) {
        const created = new EventMapEntity();
        created.uuid = uuidv4();
        created.eventUuid = event.uuid;
        created.name = data.name?.trim() || 'Mapa del evento';
        created.baseImageUrl = data.baseImageUrl ?? null;
        created.canvasWidth = 1000;
        created.canvasHeight = 1000;
        created.analysis = analysisToStore ?? null;
        created.stageLayout = grid.stageLayout;
        created.needsReanalysis = false;
        created.createdBy = loggedUser;
        await this.dbRepository.create({ entity: 'event_map', data: created, queryRunner });
        map = { ...created, stageLayout: grid.stageLayout, needsReanalysis: false };
      } else {
        // Serializa el reemplazo completo con PATCHes de vínculos tanda↔sector.
        await this.dbRepository.query(
          'SELECT uuid FROM event_map WHERE uuid = ? FOR UPDATE',
          [existing.uuid],
          queryRunner
        );
        const patch: Partial<EventMapEntity> = {};
        if (data.name !== undefined) patch.name = data.name.trim() || existing.name;
        if (data.baseImageUrl !== undefined) patch.baseImageUrl = data.baseImageUrl;
        if (analysisToStore !== undefined) patch.analysis = analysisToStore;
        // Guardar con la grilla validada limpia la marca de la migración.
        patch.stageLayout = grid.stageLayout;
        patch.needsReanalysis = false;

        if (Object.keys(patch).length) {
          // UPDATE directo en vez de `dbRepository.update`, que lee la fila con
          // un findOne por fuera del runner antes de escribirla: una consulta
          // más, en otra conexión, sobre la misma fila que la transacción está
          // por tocar.
          const fields = Object.keys(patch);
          await this.dbRepository.query(
            `UPDATE event_map SET ${fields.map(f => `\`${f}\` = ?`).join(', ')} WHERE uuid = ?`,
            [
              ...fields.map(f => {
                const value = (patch as Record<string, unknown>)[f];
                // MySQL JSON column via raw query needs a string.
                if (f === 'analysis' || f === 'stageLayout') {
                  return value == null ? null : JSON.stringify(value);
                }
                return value;
              }),
              existing.uuid
            ],
            queryRunner
          );
        }
        map = {
          uuid: existing.uuid,
          eventUuid: existing.eventUuid,
          name: patch.name ?? existing.name,
          baseImageUrl:
            patch.baseImageUrl !== undefined ? patch.baseImageUrl : existing.baseImageUrl,
          canvasWidth: existing.canvasWidth,
          canvasHeight: existing.canvasHeight,
          analysis:
            analysisToStore !== undefined
              ? analysisToStore
              : ((existing.analysis as Record<string, unknown> | null) ?? null),
          stageLayout: grid.stageLayout,
          needsReanalysis: false
        };
      }

      sectors = await this.replaceMapSectors(map.uuid, data.sectors, grid.sectorLayouts, queryRunner);
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    const ticketTypes = await this.getTicketTypes(map.eventUuid);
    const ticketTypesByUuid = new Map(ticketTypes.map(ticket => [ticket.uuid, ticket]));
    const resolvedSectors = sectors.map(sector => ({
      ...sector,
      activeTicketTypeUuid:
        selectCurrentTicketType(
          sector.ticketTypeUuids
            .map(uuid => ticketTypesByUuid.get(uuid))
            .filter((ticket): ticket is TTicketTypeResponse => Boolean(ticket))
        )?.uuid ?? null
    }));

    return {
      uuid: map.uuid,
      eventUuid: map.eventUuid,
      name: map.name,
      baseImageUrl: this.storageService.toPublicUrl(map.baseImageUrl),
      analysis: toGridAnalysis(map.analysis, { stageLayout: map.stageLayout }),
      grid: { cols: MAP_GRID_SIZE, rows: MAP_GRID_SIZE },
      stageLayout: map.stageLayout,
      needsReanalysis: map.needsReanalysis,
      sectors: resolvedSectors,
      ticketTypes
    };
  }

  /**
   * El escenario ya no es un sector. Si un cliente lo sigue mandando como
   * sector "ESCENARIO" sin tandas, se saca de la lista y (si no vino
   * `stageLayout`) sus celdas pasan a ser las del escenario.
   */
  private extractStageSector(data: TUpsertEventMap): TUpsertEventMap {
    const isStage = (s: TUpsertEventMap['sectors'][number]) =>
      isStageSectorName(s.name) && !(s.ticketTypeUuids ?? []).length;
    const stage = data.sectors.find(isStage);
    if (!stage) return data;
    return {
      ...data,
      stageLayout: data.stageLayout !== undefined ? data.stageLayout : (stage.layout ?? undefined),
      sectors: data.sectors.filter(s => !isStage(s))
    };
  }

  /**
   * Valida el layout en grilla del guardado completo y resuelve el escenario.
   *
   * Reglas: cada sector trae `layout` válido dentro de 1..24; ninguna celda se
   * repite entre sectores ni pisa el escenario.
   */
  private resolveMapGrid(
    data: TUpsertEventMap,
    existing: { stageLayout?: unknown; analysis?: unknown } | null
  ): { stageLayout: MapSectorLayout; sectorLayouts: MapSectorLayout[] } {
    try {
      let stageLayout: MapSectorLayout;
      const analysis = data.analysis !== undefined ? data.analysis : (existing?.analysis ?? null);
      if (data.stageLayout === undefined) {
        const previous = existing?.stageLayout;
        stageLayout = isSectorLayout(previous) ? previous : stageLayoutFromAnalysis(analysis);
      } else if (data.stageLayout === null) {
        stageLayout = stageLayoutFromAnalysis(analysis);
      } else {
        stageLayout = validateSectorLayout(data.stageLayout, 'Escenario');
      }

      const sectorLayouts = data.sectors.map((sector, i) => {
        const label = sector.name?.trim() || `Sector ${i + 1}`;
        if (sector.layout === undefined || sector.layout === null) {
          throw new MapGridError(
            `"${label}": falta \`layout\` en grilla. La geometría 0..1 ya no se acepta como fuente.`
          );
        }
        return validateSectorLayout(sector.layout, `"${label}"`);
      });

      const items: MapGridItem[] = [
        { id: '__stage__', label: 'Escenario', layout: stageLayout },
        ...sectorLayouts.map((layout, i) => ({
          id: `s${i}`,
          label: [data.sectors[i].level?.trim(), data.sectors[i].name?.trim() || `Sector ${i + 1}`]
            .filter(Boolean)
            .join(' · '),
          layout
        }))
      ];
      assertNoOverlaps(items);

      return { stageLayout, sectorLayouts };
    } catch (err) {
      if (err instanceof MapGridError) throw new BadRequestException(err.message);
      throw err;
    }
  }

  async setTicketTypeMapSectors(
    eventUuid: string,
    ticketTypeUuid: string,
    sectorUuids: string[],
    loggedUser: string
  ): Promise<TTicketTypeMapSectors> {
    const event = await this.assertOwnership(eventUuid, loggedUser);
    const requestedSectorUuids = [...new Set(sectorUuids)];
    const queryRunner = this.dbRepository.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // El lock serializa este cambio con otras reasignaciones del mismo mapa.
      const maps = (await this.dbRepository.query(
        'SELECT uuid FROM event_map WHERE eventUuid = ? LIMIT 1 FOR UPDATE',
        [event.uuid],
        queryRunner
      )) as Array<{ uuid: string }>;
      const map = maps[0];
      if (!map) throw new BadRequestException('Mapa del evento no encontrado');

      const ticketTypes = (await this.dbRepository.query(
        'SELECT uuid FROM ticket_type WHERE uuid = ? AND eventUuid = ? AND isActive = 1 LIMIT 1 FOR UPDATE',
        [ticketTypeUuid, event.uuid],
        queryRunner
      )) as Array<{ uuid: string }>;
      if (!ticketTypes.length) {
        throw new BadRequestException('Tipo de entrada no encontrado');
      }

      if (requestedSectorUuids.length) {
        const placeholders = requestedSectorUuids.map(() => '?').join(', ');
        const sectors = (await this.dbRepository.query(
          `SELECT uuid FROM event_map_sector WHERE mapUuid = ? AND uuid IN (${placeholders})`,
          [map.uuid, ...requestedSectorUuids],
          queryRunner
        )) as Array<{ uuid: string }>;
        if (sectors.length !== requestedSectorUuids.length) {
          throw new BadRequestException('Uno o más sectores no pertenecen al mapa de este evento');
        }
      }

      await this.dbRepository.query(
        `DELETE link
         FROM event_map_sector_ticket_type link
         INNER JOIN event_map_sector sector ON sector.uuid = link.sectorUuid
         WHERE sector.mapUuid = ? AND link.ticketTypeUuid = ?`,
        [map.uuid, ticketTypeUuid],
        queryRunner
      );

      if (requestedSectorUuids.length) {
        const links = requestedSectorUuids.map(sectorUuid => {
          const link = new EventMapSectorTicketTypeEntity();
          link.uuid = uuidv4();
          link.sectorUuid = sectorUuid;
          link.ticketTypeUuid = ticketTypeUuid;
          return link;
        });
        await this.dbRepository.createMany({
          entity: 'event_map_sector_ticket_type',
          data: links,
          queryRunner
        });
      }

      await queryRunner.commitTransaction();
      return { ticketTypeUuid, sectorUuids: requestedSectorUuids };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async uploadMapBaseImage(
    eventUuid: string,
    file: Express.Multer.File,
    loggedUser: string
  ): Promise<TEventMap> {
    const event = await this.assertOwnership(eventUuid, loggedUser);
    if (!file?.buffer?.length) throw new BadRequestException('No se recibió ningún archivo');
    if (file.size > MAX_MAP_BASE_BYTES) {
      throw new BadRequestException('El plano supera el máximo de 8 MB');
    }
    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Solo se permiten imágenes para el plano');
    }

    let processed: Buffer;
    try {
      processed = await sharp(file.buffer).webp({ quality: 82 }).toBuffer();
    } catch {
      throw new BadRequestException('El archivo no es una imagen válida');
    }

    const relativePath = `${MAPS_BASE_PATH}/${event.uuid}`;
    const filename = `base-${Date.now()}.webp`;
    const { url } = await this.storageService.saveFile({
      buffer: processed,
      relativePath,
      filename
    });

    let map = await this.dbRepository.findOne({
      entity: 'event_map',
      where: { eventUuid: event.uuid }
    });
    const previousUrl = map?.baseImageUrl ?? null;

    if (!map) {
      const created = new EventMapEntity();
      created.uuid = uuidv4();
      created.eventUuid = event.uuid;
      created.name = 'Mapa del evento';
      created.baseImageUrl = url;
      created.canvasWidth = 1000;
      created.canvasHeight = 1000;
      created.analysis = null;
      created.stageLayout = null;
      created.needsReanalysis = false;
      created.createdBy = loggedUser;
      await this.dbRepository.create({ entity: 'event_map', data: created });
      map = created;
    } else {
      await this.dbRepository.update({
        entity: 'event_map',
        where: { uuid: map.uuid },
        data: { baseImageUrl: url }
      });
      map = { ...map, baseImageUrl: url };
    }

    await this.removeStoredMapBase(event.uuid, previousUrl ?? undefined);
    return this.loadEventMap(map);
  }

  /**
   * Borra el plano subido. Los sectores ya dibujados se conservan: el plano es
   * la referencia visual, no el mapa en si.
   */
  async removeMapBaseImage(eventUuid: string, loggedUser: string): Promise<TEventMap | null> {
    const event = await this.assertOwnership(eventUuid, loggedUser);

    const map = await this.dbRepository.findOne({
      entity: 'event_map',
      where: { eventUuid: event.uuid }
    });
    if (!map) return null;

    const previousUrl = map.baseImageUrl ?? null;
    if (previousUrl) {
      await this.dbRepository.update({
        entity: 'event_map',
        where: { uuid: map.uuid },
        data: { baseImageUrl: null }
      });
      await this.removeStoredMapBase(event.uuid, previousUrl);
    }

    return this.loadEventMap({ ...map, baseImageUrl: null });
  }

  async setMapBaseFromMedia(
    eventUuid: string,
    mediaUuid: string,
    loggedUser: string
  ): Promise<TEventMap> {
    const event = await this.assertOwnership(eventUuid, loggedUser);
    const media = await this.dbRepository.findOne({
      entity: 'event_media',
      where: { uuid: mediaUuid, eventUuid: event.uuid, isDeleted: IsNull() }
    });
    if (!media || media.kind !== 'image') {
      throw new BadRequestException('Imagen de galería no encontrada');
    }

    let map = await this.dbRepository.findOne({
      entity: 'event_map',
      where: { eventUuid: event.uuid }
    });

    if (!map) {
      const created = new EventMapEntity();
      created.uuid = uuidv4();
      created.eventUuid = event.uuid;
      created.name = 'Mapa del evento';
      created.baseImageUrl = media.url;
      created.canvasWidth = 1000;
      created.canvasHeight = 1000;
      created.analysis = null;
      created.stageLayout = null;
      created.needsReanalysis = false;
      created.createdBy = loggedUser;
      await this.dbRepository.create({ entity: 'event_map', data: created });
      map = created;
    } else {
      await this.dbRepository.update({
        entity: 'event_map',
        where: { uuid: map.uuid },
        data: { baseImageUrl: media.url }
      });
      map = { ...map, baseImageUrl: media.url };
    }

    return this.loadEventMap(map);
  }

  private async loadEventMap(map: {
    uuid: string;
    eventUuid: string;
    name: string;
    baseImageUrl: string | null;
    canvasWidth: number;
    canvasHeight: number;
    analysis?: Record<string, unknown> | null;
    stageLayout?: unknown;
    needsReanalysis?: boolean | number | null;
  }): Promise<TEventMap> {
    const [sectors, ticketTypes] = await Promise.all([
      this.dbRepository.findMany({
        entity: 'event_map_sector',
        where: { mapUuid: map.uuid },
        other: { order: { sortOrder: 'ASC', createdAt: 'ASC' } }
      }),
      this.getTicketTypes(map.eventUuid)
    ]);

    const sectorUuids = sectors.map(s => s.uuid);
    const links =
      sectorUuids.length === 0
        ? []
        : await this.dbRepository.findMany({
            entity: 'event_map_sector_ticket_type',
            where: { sectorUuid: In(sectorUuids) }
          });

    const bySector = new Map<string, string[]>();
    for (const link of links) {
      const arr = bySector.get(link.sectorUuid) ?? [];
      arr.push(link.ticketTypeUuid);
      bySector.set(link.sectorUuid, arr);
    }

    const ticketTypesByUuid = new Map(ticketTypes.map(ticket => [ticket.uuid, ticket]));
    const stageLayout = isSectorLayout(map.stageLayout)
      ? map.stageLayout
      : stageLayoutFromAnalysis(map.analysis);
    // Filas "ESCENARIO" previas a la grilla: el escenario viaja en stageLayout.
    const mappedSectors: TEventMapSector[] = sectors.filter(s => !isStageSectorName(s.name)).map(s => {
      const ticketTypeUuids = bySector.get(s.uuid) ?? [];
      const layout = isSectorLayout(s.layout) ? s.layout : null;
      return {
        uuid: s.uuid,
        name: s.name,
        level: s.level ?? null,
        familyLabel: s.familyLabel ?? null,
        layout,
        color: s.color ?? null,
        sortOrder: s.sortOrder,
        isNumbered: !!s.isNumbered,
        capacity: s.capacity ?? null,
        ticketTypeUuids,
        activeTicketTypeUuid:
          selectCurrentTicketType(
            ticketTypeUuids
              .map(uuid => ticketTypesByUuid.get(uuid))
              .filter((ticket): ticket is TTicketTypeResponse => Boolean(ticket))
          )?.uuid ?? null
      };
    });

    return {
      uuid: map.uuid,
      eventUuid: map.eventUuid,
      name: map.name,
      baseImageUrl: this.storageService.toPublicUrl(map.baseImageUrl),
      analysis: toGridAnalysis(map.analysis, { stageLayout }),
      grid: { cols: MAP_GRID_SIZE, rows: MAP_GRID_SIZE },
      stageLayout,
      needsReanalysis: !!map.needsReanalysis,
      sectors: mappedSectors,
      ticketTypes
    };
  }

  /** GET mapa: siempre incluye tandas; si no hay mapa, uuid queda null. */
  private async loadEventMapBundle(
    eventUuid: string,
    map: {
      uuid: string;
      eventUuid: string;
      name: string;
      baseImageUrl: string | null;
      canvasWidth: number;
      canvasHeight: number;
      analysis?: Record<string, unknown> | null;
      stageLayout?: unknown;
      needsReanalysis?: boolean | number | null;
    } | null
  ): Promise<TEventMap> {
    if (map) return this.loadEventMap(map);

    const ticketTypes = await this.getTicketTypes(eventUuid);
    return {
      uuid: null,
      eventUuid,
      name: '',
      baseImageUrl: null,
      analysis: null,
      grid: { cols: MAP_GRID_SIZE, rows: MAP_GRID_SIZE },
      stageLayout: stageLayoutFromAnalysis(null),
      needsReanalysis: false,
      sectors: [],
      ticketTypes
    };
  }

  /**
   * Dos sectores con el mismo nombre en un mapa se leen como el mismo lugar:
   * la vista los agrupa y la misma mesa terminaria vendiendose dos veces. Se
   * compara sin distinguir mayusculas ni espacios de mas.
   */
  /**
   * Un sector se identifica por (nivel, nombre), no por nombre.
   *
   * Los planos de varias plantas reinician la numeración en cada una: el "15"
   * del primer piso y el del segundo son unidades distintas con la misma
   * etiqueta impresa. Comparar solo por nombre rechazaba el mapa entero.
   *
   * La restricción sigue existiendo porque el nombre es lo que ve el validador
   * en la puerta: dentro de un mismo nivel no puede haber dos iguales.
   */
  private assertUniqueSectorNames(sectors: TUpsertEventMap['sectors']): void {
    const seen = new Map<string, { name: string; level: string | null }>();
    for (const sector of sectors) {
      const name = sector.name?.trim() ?? '';
      if (!name) continue;
      const level = sector.level?.trim() || null;
      const key = `${(level ?? '').toLowerCase()}\u0000${name.toLowerCase().replace(/\s+/g, ' ')}`;
      const previous = seen.get(key);
      if (previous) {
        throw new BadRequestException(
          previous.level
            ? `El mapa tiene dos sectores llamados "${previous.name}" en "${previous.level}"`
            : `El mapa tiene dos sectores llamados "${previous.name}". ` +
              'Si pertenecen a pisos distintos, indicá el piso de cada uno.'
        );
      }
      seen.set(key, { name, level });
    }
  }

  private async validateSectorTicketTypes(
    eventUuid: string,
    sectors: TUpsertEventMap['sectors']
  ): Promise<void> {
    const allTt = new Set(
      sectors.flatMap(s => s.ticketTypeUuids ?? []).filter(Boolean)
    );
    if (allTt.size === 0) return;

    const rows = await this.dbRepository.findMany({
      entity: 'ticket_type',
      where: {
        eventUuid,
        isActive: true,
        uuid: In([...allTt])
      },
      select: { uuid: true }
    });
    if (rows.length !== allTt.size) {
      throw new BadRequestException(
        'Una o más tandas asociadas a sectores no pertenecen a este evento'
      );
    }
  }

  /**
   * Reemplaza la lista de sectores del mapa y devuelve la que quedó.
   *
   * Devolverla evita releer lo recién escrito para armar la respuesta: acá ya
   * está todo armado en memoria, con los uuid definitivos.
   *
   * Corre siempre dentro del runner que le pasa `upsertEventMap`: el DELETE y
   * los INSERT tienen que ir en la misma transacción o un error en el medio
   * deja al productor sin mapa.
   */
  private async replaceMapSectors(
    mapUuid: string,
    sectors: TUpsertEventMap['sectors'],
    layouts: MapSectorLayout[],
    queryRunner: QueryRunner
  ): Promise<TEventMapSector[]> {
    // Los vinculos con tandas se van solos: la FK es ON DELETE CASCADE. Leer
    // los sectores para borrarlos por lista era una consulta al pedo.
    await this.dbRepository.delete({
      entity: 'event_map_sector',
      where: { mapUuid } as any,
      queryRunner
    });

    // Un mapa de estadio son cientos de sectores: se arma todo en memoria y se
    // inserta en dos lotes. Insertar de a uno eran ~2N round trips a la base y
    // el upsert se iba a decenas de segundos.
    const newSectors: EventMapSectorEntity[] = [];
    const newLinks: EventMapSectorTicketTypeEntity[] = [];

    for (let i = 0; i < sectors.length; i++) {
      const src = sectors[i];
      const sector = new EventMapSectorEntity();
      sector.uuid = src.uuid?.trim() || uuidv4();
      sector.mapUuid = mapUuid;
      sector.name = src.name.trim();
      sector.level = src.level?.trim() || null;
      sector.familyLabel = src.familyLabel?.trim().slice(0, 160) || null;
      const color = (src.color ?? '').trim().slice(0, 32) || null;
      sector.layout = layouts[i];
      sector.color = color;
      // Columna legacy (solo para rollback de la migración): se deriva de las
      // celdas y nunca se lee ni se expone.
      sector.geometry = layoutToLegacyGeometry(layouts[i], color);
      sector.sortOrder = src.sortOrder ?? i;
      sector.isNumbered = src.isNumbered ?? false;
      sector.capacity = src.capacity ?? null;
      newSectors.push(sector);

      for (const ttUuid of src.ticketTypeUuids ?? []) {
        const link = new EventMapSectorTicketTypeEntity();
        link.uuid = uuidv4();
        link.sectorUuid = sector.uuid;
        link.ticketTypeUuid = ttUuid;
        newLinks.push(link);
      }
    }

    if (newSectors.length) {
      await this.dbRepository.createMany({
        entity: 'event_map_sector',
        data: newSectors as never,
        queryRunner
      });
    }
    if (newLinks.length) {
      await this.dbRepository.createMany({
        entity: 'event_map_sector_ticket_type',
        data: newLinks as never,
        queryRunner
      });
    }

    const ticketTypesBySector = new Map<string, string[]>();
    for (const link of newLinks) {
      const arr = ticketTypesBySector.get(link.sectorUuid) ?? [];
      arr.push(link.ticketTypeUuid);
      ticketTypesBySector.set(link.sectorUuid, arr);
    }

    return newSectors.map(sector => ({
      uuid: sector.uuid,
      name: sector.name,
      level: sector.level ?? null,
      familyLabel: sector.familyLabel ?? null,
      layout: sector.layout,
      color: sector.color,
      sortOrder: sector.sortOrder,
      isNumbered: !!sector.isNumbered,
      capacity: sector.capacity ?? null,
      ticketTypeUuids: ticketTypesBySector.get(sector.uuid) ?? [],
      activeTicketTypeUuid: null
    }));
  }

  private async removeStoredMapBase(eventUuid: string, url: string | undefined): Promise<void> {
    const pathname = this.storageService.staticPathname(url);
    if (!pathname?.includes(`/static/${MAPS_BASE_PATH}/${eventUuid}/`)) return;
    const filename = pathname.split('/').pop();
    if (!filename) return;
    await this.storageService.deleteFile(
      this.storageService.resolveAbsolutePath(`${MAPS_BASE_PATH}/${eventUuid}`, filename)
    );
  }

  /** Borra del volumen una imagen previa, solo si es un archivo servido por nosotros. */
  private async removeStoredBanner(eventUuid: string, url: string | undefined): Promise<void> {
    const pathname = this.storageService.staticPathname(url);
    if (!pathname?.includes(`/static/${BANNERS_BASE_PATH}/${eventUuid}/`)) return;
    const filename = pathname.split('/').pop();
    if (!filename) return;
    await this.storageService.deleteFile(
      this.storageService.resolveAbsolutePath(`${BANNERS_BASE_PATH}/${eventUuid}`, filename)
    );
  }

  async getEventProducers(eventUuid: string, loggedUser: string): Promise<TEventProducer[]> {
    await this.assertOwnership(eventUuid, loggedUser, { readOnly: true });

    const rows = await this.dbRepository.findMany({
      entity: 'event_producer',
      where: { eventUuid } as any,
      relations: { user: true } as any
    });

    return rows.map((r: any) => ({
      uuid: r.uuid,
      userUuid: r.userUuid,
      firstName: r.user?.firstName ?? '',
      lastName: r.user?.lastName ?? '',
      email: r.user?.email ?? '',
      createdAt: r.createdAt
    }));
  }

  /**
   * Asigna un productor a un evento puntual. Idempotente.
   * Además lo vincula a la organización dueña del evento: sin ese vínculo el
   * productor no podría operar sobre los recursos de la organización.
   */
  async assignProducerToEvent(eventUuid: string, userUuid: string, loggedUser: string): Promise<void> {
    const event = await this.assertOwnership(eventUuid, loggedUser);

    const user = await this.dbRepository.findOne({
      entity: 'user',
      where: { uuid: userUuid, isDeleted: IsNull() }
    });
    if (!user) throw new BadRequestException('Usuario no encontrado');

    const existing = await this.dbRepository.findOne({
      entity: 'event_producer',
      where: { eventUuid, userUuid } as any
    });

    if (!existing) {
      const assignment = new EventProducerEntity();
      assignment.uuid = uuidv4();
      assignment.eventUuid = eventUuid;
      assignment.userUuid = userUuid;
      assignment.assignedBy = loggedUser;
      await this.dbRepository.create({ entity: 'event_producer', data: assignment });
    }

    await this.linkUserToOrganization(userUuid, event.organizationUuid);
  }

  /**
   * Vincula al usuario con la organización del evento. Idempotente: si ya
   * existe no hace nada, y si estaba dado de baja lo reactiva.
   */
  private async linkUserToOrganization(userUuid: string, organizationUuid: string): Promise<void> {
    const membership = await this.dbRepository.findOne({
      entity: 'user_organization',
      where: { userUuid, organizationUuid } as any
    });

    if (!membership) {
      const link = new UserOrganizationEntity();
      link.uuid = uuidv4();
      link.userUuid = userUuid;
      link.organizationUuid = organizationUuid;
      link.createdAt = new Date();
      await this.dbRepository.create({ entity: 'user_organization', data: link });
      return;
    }

    if (membership.isDeleted) {
      await this.dbRepository.update({
        entity: 'user_organization',
        where: { uuid: membership.uuid } as any,
        data: { isDeleted: null }
      });
    }
  }

  async removeProducerFromEvent(eventUuid: string, userUuid: string, loggedUser: string): Promise<void> {
    await this.assertOwnership(eventUuid, loggedUser);
    await this.dbRepository.delete({ entity: 'event_producer', where: { eventUuid, userUuid } as any });
  }

  // ── Empleados del evento (Validador / Caja) ───────────────────────────────

  async getEventEmployees(eventUuid: string, loggedUser: string): Promise<TEventEmployee[]> {
    await this.assertOwnership(eventUuid, loggedUser, { readOnly: true });

    const [validators, cashiers] = await Promise.all([
      this.dbRepository.findMany({
        entity: 'event_validator',
        where: { eventUuid } as any,
        relations: { user: true } as any
      }),
      this.dbRepository.findMany({
        entity: 'user_event_cashier',
        where: { eventUuid, isDeleted: IsNull() } as any,
        relations: { user: true } as any
      })
    ]);

    const items: TEventEmployee[] = [
      ...validators.map((r: any) => ({
        uuid: r.uuid,
        userUuid: r.userUuid,
        role: 'validator' as const,
        firstName: r.user?.firstName ?? '',
        lastName: r.user?.lastName ?? '',
        email: r.user?.email ?? '',
        createdAt: r.createdAt
      })),
      ...cashiers.map((r: any) => ({
        uuid: r.uuid,
        userUuid: r.userUuid,
        role: 'cashier' as const,
        firstName: r.user?.firstName ?? '',
        lastName: r.user?.lastName ?? '',
        email: r.user?.email ?? '',
        createdAt: r.createdAt
      }))
    ];

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return items;
  }

  async getEmployeeCandidates(
    eventUuid: string,
    search: string,
    role: TEventEmployeeRole | undefined,
    loggedUser: string
  ): Promise<TUserSummary[]> {
    await this.assertOwnership(eventUuid, loggedUser, { readOnly: true });

    const term = search?.trim();
    if (!term) return [];

    const assignedUuids = new Set<string>();
    const wantValidator = !role || role === 'validator';
    const wantCashier = !role || role === 'cashier';

    if (wantValidator) {
      const assigned = await this.dbRepository.findMany({
        entity: 'event_validator',
        where: { eventUuid } as any
      });
      for (const a of assigned as any[]) assignedUuids.add(a.userUuid);
    }
    if (wantCashier) {
      const assigned = await this.dbRepository.findMany({
        entity: 'user_event_cashier',
        where: { eventUuid, isDeleted: IsNull() } as any
      });
      for (const a of assigned as any[]) assignedUuids.add(a.userUuid);
    }

    const users = await this.dbRepository.findMany({
      entity: 'user',
      where: [
        { firstName: Like(`%${term}%`), isDeleted: IsNull(), active: 1 },
        { lastName: Like(`%${term}%`), isDeleted: IsNull(), active: 1 },
        { email: Like(`%${term}%`), isDeleted: IsNull(), active: 1 }
      ] as any,
      other: { take: 10 }
    });

    return users
      .filter((u: any) => !assignedUuids.has(u.uuid))
      .map((u: any) => ({
        uuid: u.uuid,
        firstName: u.firstName ?? '',
        lastName: u.lastName ?? '',
        email: u.email ?? ''
      }));
  }

  async upsertEventEmployee(
    eventUuid: string,
    data: TUpsertEventEmployeeInput,
    loggedUser: string
  ): Promise<TEventEmployee> {
    const event = await this.assertOwnership(eventUuid, loggedUser);
    const role = data.role;

    let userUuid = data.userUuid?.trim();

    if (!userUuid) {
      const email = data.email?.trim().toLowerCase();
      const password = data.password ?? '';
      if (!email || !password) {
        throw new BadRequestException('Para crear un empleado necesitás email y contraseña');
      }
      if (!PASSWORD_POLICY.test(password)) {
        throw new BadRequestException(
          'La contraseña debe tener al menos 8 caracteres, con letras, números y un carácter especial.'
        );
      }

      let user = await this.dbRepository.findOne({
        entity: 'user',
        where: { email, isDeleted: IsNull() }
      });

      if (!user) {
        const entity = new UserEntity();
        entity.uuid = uuidv4();
        entity.firstName = (data.firstName?.trim() || email.split('@')[0] || 'Usuario').slice(0, 255);
        entity.lastName = (data.lastName?.trim() || 'Staff').slice(0, 255);
        entity.email = email;
        entity.password = await bcryptjs.hash(password, 10);
        entity.active = 1;
        entity.emailVerified = true;
        entity.emailVerifiedAt = new Date();
        entity.twoAuthentication = false;
        entity.isDeleted = null;
        entity.createdBy = loggedUser;
        await this.dbRepository.create({ entity: 'user', data: entity });
        user = entity;
      }

      userUuid = user.uuid;
    } else {
      const user = await this.dbRepository.findOne({
        entity: 'user',
        where: { uuid: userUuid, isDeleted: IsNull() }
      });
      if (!user) throw new BadRequestException('Usuario no encontrado');
    }

    if (role === 'validator') {
      await this.assignValidatorLink(eventUuid, userUuid, loggedUser);
    } else {
      await this.assignCashierLink(eventUuid, event.organizationUuid, userUuid, loggedUser);
    }

    await this.grantStaffRole(userUuid, role === 'validator' ? 'Validador' : 'Caja', loggedUser);
    await this.linkUserToOrganization(userUuid, event.organizationUuid);

    const user = await this.dbRepository.findOne({
      entity: 'user',
      where: { uuid: userUuid }
    });

    const assignment =
      role === 'validator'
        ? await this.dbRepository.findOne({
            entity: 'event_validator',
            where: { eventUuid, userUuid } as any
          })
        : await this.dbRepository.findOne({
            entity: 'user_event_cashier',
            where: { eventUuid, userUuid, isDeleted: IsNull() } as any
          });

    return {
      uuid: (assignment as any)?.uuid ?? userUuid,
      userUuid,
      role,
      firstName: (user as any)?.firstName ?? '',
      lastName: (user as any)?.lastName ?? '',
      email: (user as any)?.email ?? '',
      createdAt: (assignment as any)?.createdAt ?? new Date()
    };
  }

  async removeEventEmployee(
    eventUuid: string,
    userUuid: string,
    role: TEventEmployeeRole,
    loggedUser: string
  ): Promise<void> {
    await this.assertOwnership(eventUuid, loggedUser);

    if (role === 'validator') {
      await this.dbRepository.delete({
        entity: 'event_validator',
        where: { eventUuid, userUuid } as any
      });
      return;
    }

    const row = await this.dbRepository.findOne({
      entity: 'user_event_cashier',
      where: { eventUuid, userUuid, isDeleted: IsNull() } as any
    });
    if (row) {
      await this.dbRepository.update({
        entity: 'user_event_cashier',
        where: { uuid: (row as any).uuid } as any,
        data: { isDeleted: new Date() }
      });
    }
  }

  private async assignValidatorLink(
    eventUuid: string,
    userUuid: string,
    loggedUser: string
  ): Promise<void> {
    const existing = await this.dbRepository.findOne({
      entity: 'event_validator',
      where: { eventUuid, userUuid } as any
    });
    if (existing) return;

    const assignment = new EventValidatorEntity();
    assignment.uuid = uuidv4();
    assignment.eventUuid = eventUuid;
    assignment.userUuid = userUuid;
    assignment.assignedBy = loggedUser;
    await this.dbRepository.create({ entity: 'event_validator', data: assignment });
  }

  private async assignCashierLink(
    eventUuid: string,
    organizationUuid: string,
    userUuid: string,
    loggedUser: string
  ): Promise<void> {
    const existing = await this.dbRepository.findOne({
      entity: 'user_event_cashier',
      where: { eventUuid, userUuid } as any
    });

    if (existing) {
      if ((existing as any).isDeleted) {
        await this.dbRepository.update({
          entity: 'user_event_cashier',
          where: { uuid: (existing as any).uuid } as any,
          data: { isDeleted: null, isHidden: false }
        });
      }
      return;
    }

    const row = new UserEventCashierEntity();
    row.uuid = uuidv4();
    row.userUuid = userUuid;
    row.eventUuid = eventUuid;
    row.organizationUuid = organizationUuid;
    row.isHidden = false;
    row.isDeleted = null;
    row.createdBy = loggedUser;
    await this.dbRepository.create({ entity: 'user_event_cashier', data: row });
  }

  /**
   * Otorga Validador o Caja si falta. No se lo suma a un Administrador.
   * Se busca el rol por nombre (UUIDs de seeds varían entre entornos).
   */
  private async grantStaffRole(
    userUuid: string,
    roleName: 'Validador' | 'Caja',
    assignedBy: string
  ): Promise<void> {
    const currentRoles = await this.dbRepository.findMany({
      entity: 'user_role',
      where: { userUuid, isDeleted: IsNull() } as any,
      relations: { role: true } as any
    });
    if (currentRoles.some((ur: any) => ur.role?.name === 'Administrador')) return;

    const role = await this.dbRepository.findOne({
      entity: 'role',
      where: { name: roleName, isDeleted: IsNull() } as any
    });
    if (!role) throw new BadRequestException(`No existe el rol ${roleName} en el sistema`);

    const existing = await this.dbRepository.findOne({
      entity: 'user_role',
      where: { userUuid, roleUuid: (role as any).uuid } as any
    });

    if (!existing) {
      const link = new UserRoleEntity();
      link.uuid = uuidv4();
      link.userUuid = userUuid;
      link.roleUuid = (role as any).uuid;
      link.createdBy = assignedBy;
      await this.dbRepository.create({ entity: 'user_role', data: link });
    } else if ((existing as any).isDeleted) {
      await this.dbRepository.update({
        entity: 'user_role',
        where: { uuid: (existing as any).uuid } as any,
        data: { isDeleted: null, updatedBy: assignedBy }
      });
    }
  }

  /** @deprecated Prefer getEventEmployees */
  async getEventValidators(eventUuid: string, loggedUser: string): Promise<TEventValidator[]> {
    const employees = await this.getEventEmployees(eventUuid, loggedUser);
    return employees
      .filter(e => e.role === 'validator')
      .map(({ uuid, userUuid, firstName, lastName, email, createdAt }) => ({
        uuid,
        userUuid,
        firstName,
        lastName,
        email,
        createdAt
      }));
  }

  /** @deprecated Prefer getEmployeeCandidates */
  async getValidatorCandidates(
    eventUuid: string,
    search: string,
    loggedUser: string
  ): Promise<TUserSummary[]> {
    return this.getEmployeeCandidates(eventUuid, search, 'validator', loggedUser);
  }

  /** @deprecated Prefer upsertEventEmployee */
  async assignValidatorToEvent(eventUuid: string, userUuid: string, loggedUser: string): Promise<void> {
    await this.upsertEventEmployee(eventUuid, { role: 'validator', userUuid }, loggedUser);
  }

  /** @deprecated Prefer removeEventEmployee */
  async removeValidatorFromEvent(eventUuid: string, userUuid: string, loggedUser: string): Promise<void> {
    await this.removeEventEmployee(eventUuid, userUuid, 'validator', loggedUser);
  }

  /** Aplica los filtros de la query y ejecuta la búsqueda paginada */
  /**
   * Marca cada evento como agotado o no con UNA sola consulta para toda la
   * página (nada de una por tarjeta).
   *
   * Se mira `availableQuantity` de MySQL, que baja recién al confirmarse el
   * pago. Las reservas en Redis sin pagar no cuentan como vendidas: expiran a
   * los 10 minutos y volverían a estar disponibles.
   *
   * También resuelve `eventImages` (flyer de galería + banners + mapa).
   */
  private async attachSoldOut(events: TEventResponse[]): Promise<TEventListItem[]> {
    if (events.length === 0) return [];

    const eventUuids = events.map(e => e.uuid);

    const [ticketTypes, galleryImages, maps] = await Promise.all([
      this.dbRepository.findMany({
        entity: 'ticket_type',
        where: { eventUuid: In(eventUuids), isActive: true },
        select: { eventUuid: true, availableQuantity: true }
      }),
      this.dbRepository.findMany({
        entity: 'event_media',
        where: { eventUuid: In(eventUuids), isDeleted: IsNull(), kind: 'image' },
        other: { order: { sortOrder: 'ASC', createdAt: 'ASC' } },
        select: { eventUuid: true, url: true, sortOrder: true }
      }),
      this.dbRepository.findMany({
        entity: 'event_map',
        where: { eventUuid: In(eventUuids) },
        select: { eventUuid: true, baseImageUrl: true }
      })
    ]);

    const withStock = new Set<string>();
    for (const tt of ticketTypes) {
      if (tt.availableQuantity > 0) withStock.add(tt.eventUuid);
    }

    // Un evento sin ningún tipo de entrada activo no se considera agotado: no
    // llegó a estar a la venta. Publicar en ese estado ya está bloqueado.
    const withAnyType = new Set(ticketTypes.map(tt => tt.eventUuid));

    // Primera imagen de galería por evento = flyer principal (sortOrder ASC)
    const flyerByEvent = new Map<string, string>();
    for (const row of galleryImages) {
      if (!flyerByEvent.has(row.eventUuid) && row.url) {
        flyerByEvent.set(row.eventUuid, row.url);
      }
    }

    const mapByEvent = new Map<string, string | null>();
    for (const row of maps) {
      mapByEvent.set(row.eventUuid, row.baseImageUrl ?? null);
    }

    return events.map(event => ({
      ...event,
      soldOut: withAnyType.has(event.uuid) && !withStock.has(event.uuid),
      eventImages: this.publicEventImages(
        buildEventImages(
          event,
          flyerByEvent.get(event.uuid) ?? null,
          mapByEvent.get(event.uuid) ?? null
        )
      )
    }));
  }

  /** Adjunta flyer (galería) + mapa + datos públicos de la productora. */
  private async withEventImages(event: TEventResponse): Promise<TEventDetailItem> {
    const [flyerMedia, map, org] = await Promise.all([
      this.dbRepository.findOne({
        entity: 'event_media',
        where: { eventUuid: event.uuid, isDeleted: IsNull(), kind: 'image' },
        other: { order: { sortOrder: 'ASC', createdAt: 'ASC' } },
        select: { url: true }
      }),
      this.dbRepository.findOne({
        entity: 'event_map',
        where: { eventUuid: event.uuid },
        select: { baseImageUrl: true }
      }),
      this.dbRepository.findOne({
        entity: 'organization',
        where: { uuid: event.organizationUuid },
        select: {
          name: true,
          website: true,
          contactPhone: true,
          instagram: true,
          tiktok: true,
          facebook: true,
          socialX: true
        }
      })
    ]);

    return {
      ...event,
      eventImages: this.publicEventImages(
        buildEventImages(event, flyerMedia?.url ?? null, map?.baseImageUrl ?? null)
      ),
      producer: {
        name: org?.name ?? '',
        website: org?.website ?? null,
        phone: org?.contactPhone ?? null,
        instagram: org?.instagram ?? null,
        tiktok: org?.tiktok ?? null,
        facebook: org?.facebook ?? null,
        socialX: org?.socialX ?? null
      }
    };
  }

  /** Reescribe hosts de storage al APP_URL del entorno (local / ngrok / prod). */
  private publicEventImages(images: {
    flyer: string | null;
    bannerDesktop: string | null;
    bannerMobile: string | null;
    mapEvent: string | null;
  }) {
    return {
      flyer: this.storageService.toPublicUrl(images.flyer),
      bannerDesktop: this.storageService.toPublicUrl(images.bannerDesktop),
      bannerMobile: this.storageService.toPublicUrl(images.bannerMobile),
      mapEvent: this.storageService.toPublicUrl(images.mapEvent)
    };
  }

  private publicBannerImages(banners: BannerImages): BannerImages {
    const out: BannerImages = {};
    if (banners.desktop) out.desktop = this.storageService.toPublicUrl(banners.desktop) ?? banners.desktop;
    if (banners.mobile) out.mobile = this.storageService.toPublicUrl(banners.mobile) ?? banners.mobile;
    if (banners.thumbnail) {
      out.thumbnail = this.storageService.toPublicUrl(banners.thumbnail) ?? banners.thumbnail;
    }
    return out;
  }

  /**
   * Filtros comunes del listado. Se aplican sobre una condicion ya armada para
   * que la vista publica y la de backoffice (que es un OR de condiciones)
   * compartan exactamente el mismo criterio.
   */
  private applyEventFilters(
    condition: Record<string, unknown>,
    filters: TEventFilters
  ): Record<string, unknown> {
    const c = { ...condition };

    if (filters.city?.length) {
      c['venueCity'] =
        filters.city.length === 1 ? Like(`%${filters.city[0]}%`) : Or(...filters.city.map(x => Like(`%${x}%`)));
    }
    if (filters.country?.length) {
      c['venueCountry'] =
        filters.country.length === 1
          ? Like(`%${filters.country[0]}%`)
          : Or(...filters.country.map(x => Like(`%${x}%`)));
    }
    if (filters.organizationUuid?.length) c['organizationUuid'] = In(filters.organizationUuid);

    const status = filters.status?.[0];
    if (status === 'draft') {
      c['isPublished'] = false;
      c['cancelledAt'] = IsNull();
    } else if (status === 'published') {
      c['isPublished'] = true;
      c['cancelledAt'] = IsNull();
      // Lo que ya terminó vive en Finalizados: sin esta condición, el filtro de
      // Publicados mostraba eventos con el cartel de Finalizado encima.
      c['endDate'] = MoreThanOrEqual(new Date());
    } else if (status === 'cancelled') {
      c['cancelledAt'] = Not(IsNull());
    } else if (status === 'sales_closed') {
      c['salesClosedAt'] = Not(IsNull());
    } else if (status === 'finished') {
      // Publicado, además de pasado: un borrador con fecha vieja nunca llegó a
      // ocurrir, así que no "finalizó" — sigue siendo un borrador. Sin esta
      // condición aparecía en Finalizados con el cartel de Borrador encima.
      c['isPublished'] = true;
      c['endDate'] = LessThan(new Date());
      c['cancelledAt'] = IsNull();
    }

    // El rango es sobre startDate e inclusive: 'hasta' toma el dia completo.
    const from = filters.dateFrom?.[0];
    const to = filters.dateTo?.[0];
    if (from && to) {
      c['startDate'] = Between(new Date(`${from}T00:00:00`), new Date(`${to}T23:59:59.999`));
    } else if (from) {
      c['startDate'] = MoreThanOrEqual(new Date(`${from}T00:00:00`));
    } else if (to) {
      c['startDate'] = LessThanOrEqual(new Date(`${to}T23:59:59.999`));
    }

    return c;
  }

  /** Orden pedido por el cliente, acotado a columnas conocidas. */
  private resolveEventOrder(order?: TEventOrder): Record<string, 'ASC' | 'DESC'> {
    if (!order || !EVENT_ORDER_COLUMNS.includes(order.order_by as (typeof EVENT_ORDER_COLUMNS)[number])) {
      return { startDate: 'ASC' };
    }
    return { [order.order_by]: order.order_direction === 'desc' ? 'DESC' : 'ASC' };
  }

  private async runEventsQuery(
    conditions: Record<string, unknown>[],
    filters: TEventFilters,
    pagination: IPaginationParams,
    order?: TEventOrder
  ): Promise<{ meta: PaginationMetaResponse; items: TEventListItem[] }> {
    const withFilters = conditions.map(cond => this.applyEventFilters(cond, filters));

    const result = await this.dbRepository.findManyAndCount({
      entity: 'event',
      where: withFilters as any,
      other: {
        take: pagination.limit,
        skip: (pagination.page - 1) * pagination.limit,
        order: this.resolveEventOrder(order)
      }
    });

    const meta = new PaginationMetaResponse({
      limit: pagination.limit,
      page: pagination.page,
      total: result.count
    });

    return { meta, items: await this.attachSoldOut(result.items as TEventResponse[]) };
  }

  /** Eventos asignados puntualmente al usuario (event_producer) */
  /**
   * Eventos asignados puntualmente al usuario, como productor o como validador
   * de puerta. Se incluyen los dos para que un validador vea su evento en el
   * escáner aunque la membresía de organización falte (por ejemplo, si lo
   * desvincularon de la organización pero sigue asignado al show).
   */
  /**
   * Eventos que le asignaron puntualmente, fuera de sus organizaciones.
   *
   * **Solo `event_producer`.** Ser validador de un evento no da acceso al
   * backoffice: el validador entra por `/check-in/my-events`, que filtra por
   * día de trabajo. Incluirlo acá le mostraba el evento en "Mis eventos" y al
   * abrirlo se comía un "No tenés permiso para modificar este evento", porque
   * `assertOwnership` nunca aceptó esa vía.
   *
   * El criterio de esta consulta tiene que seguir siendo el mismo que el de
   * `assertOwnership`: si el listado muestra algo que no se puede abrir, es un
   * bug.
   */
  private async getAssignedEventUuids(loggedUser?: string | null): Promise<string[]> {
    if (!loggedUser) return [];
    const asProducer = await this.dbRepository.findMany({
      entity: 'event_producer',
      where: { userUuid: loggedUser } as any
    });
    return [...new Set(asProducer.map(r => r.eventUuid))];
  }

  /** Organizaciones a las que pertenece el usuario (base del alcance de un productor) */
  private async getUserOrganizationUuids(loggedUser?: string | null): Promise<string[]> {
    if (!loggedUser) return [];
    const memberships = await this.dbRepository.findMany({
      entity: 'user_organization',
      where: { userUuid: loggedUser, isDeleted: IsNull() } as any
    });
    return [...new Set(memberships.map(m => m.organizationUuid))];
  }

  /**
   * Coherencia entre las cuatro fechas del evento. Se valida sobre el estado
   * final (existente + cambios), no solo sobre lo que vino en el request:
   * un update parcial puede romper la relación con un campo que no se envió.
   */
  private assertDateCoherence(dates: {
    startDate: Date | string;
    endDate: Date | string;
    saleStartDate?: Date | string | null;
    saleEndDate?: Date | string | null;
  }): void {
    const start = new Date(dates.startDate);
    const end = new Date(dates.endDate);

    if (end <= start) {
      throw new BadRequestException('La fecha de fin del evento debe ser posterior a la de inicio');
    }

    const saleStart = dates.saleStartDate ? new Date(dates.saleStartDate) : null;
    const saleEnd = dates.saleEndDate ? new Date(dates.saleEndDate) : null;

    if (saleStart && saleEnd && saleEnd <= saleStart) {
      throw new BadRequestException('El fin de la venta debe ser posterior al inicio de la venta');
    }

    if (saleStart && saleStart >= start) {
      throw new BadRequestException('La venta debe comenzar antes del inicio del evento');
    }

    // Sin saleEndDate la venta corre hasta el fin del evento; un valor posterior
    // a esa fecha no tendría efecto.
    if (saleEnd && saleEnd > end) {
      throw new BadRequestException('La venta no puede finalizar después del fin del evento');
    }
  }

  /**
   * Una productora suspendida no opera (`BR-PROD-006`): su backoffice queda en
   * solo lectura. El Admin no queda alcanzado — es quien tiene que poder
   * seguir tocando las cosas de esa productora.
   */
  private async assertOrganizationNotSuspended(organizationUuid: string): Promise<void> {
    const org = await this.dbRepository.findOne({
      entity: 'organization',
      where: { uuid: organizationUuid }
    });
    if (org && org.active === 0) {
      throw new ForbiddenException(
        'La productora está suspendida. Escribinos desde Ayuda para regularizar la situación.'
      );
    }
  }

  /**
   * Permiso sobre un evento. **Bloquea por defecto si la productora está
   * suspendida**: las lecturas que tienen que seguir andando lo piden
   * explícitamente con `readOnly`, así un método nuevo que escriba hereda el
   * bloqueo sin que nadie tenga que acordarse.
   */
  private async assertOwnership(
    eventUuid: string,
    loggedUser: string,
    options?: { readOnly?: boolean }
  ): Promise<TEventResponse> {
    const event = await this.dbRepository.findOne({
      entity: 'event',
      where: { uuid: eventUuid, isActive: true }
    });
    if (!event) throw new BadRequestException('Evento no encontrado');

    const isAdmin = await this.userPermission.userPermission(loggedUser);
    if (isAdmin) return event as TEventResponse;

    if (!options?.readOnly) {
      await this.assertOrganizationNotSuspended(event.organizationUuid);
    }

    const membership = await this.dbRepository.findOne({
      entity: 'user_organization',
      where: { userUuid: loggedUser, organizationUuid: event.organizationUuid, isDeleted: IsNull() } as any
    });
    if (membership) return event as TEventResponse;

    // Acceso alternativo: asignación puntual a este evento
    const assignment = await this.dbRepository.findOne({
      entity: 'event_producer',
      where: { userUuid: loggedUser, eventUuid: event.uuid } as any
    });
    if (!assignment) throw new ForbiddenException('No tenés permiso para modificar este evento');

    return event as TEventResponse;
  }

  private async assertOrganizationMembership(organizationUuid: string, loggedUser: string): Promise<void> {
    const isAdmin = await this.userPermission.userPermission(loggedUser);
    if (isAdmin) return;

    await this.assertOrganizationNotSuspended(organizationUuid);

    const membership = await this.dbRepository.findOne({
      entity: 'user_organization',
      where: { userUuid: loggedUser, organizationUuid, isDeleted: IsNull() } as any
    });
    if (!membership) throw new ForbiddenException('No pertenecés a esta organización');
  }

  // ── Gastos del evento (FP08) ───────────────────────────────────────────────

  async getExpenses(
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
  }> {
    await this.assertOwnership(eventUuid, loggedUser, { readOnly: true });

    const page = Math.max(opts?.pagination?.page ?? 1, 1);
    const limit = opts?.pagination?.limit ?? 10;
    const category = opts?.filters?.category?.[0];
    const searchTerm = opts?.search?.search?.trim();

    const where: Record<string, unknown> = { eventUuid, isDeleted: IsNull() };
    if (category) where.category = category;
    if (searchTerm) where.concept = Like(`%${searchTerm}%`);

    const result = await this.dbRepository.findManyAndCount({
      entity: 'event_expense',
      where: where as any,
      other: {
        take: limit,
        skip: (page - 1) * limit,
        order: {
          ...resolveListOrder(opts?.order, EXPENSE_ORDER_COLUMNS, {
            expenseDate: 'DESC',
            createdAt: 'DESC'
          }),
          uuid: 'ASC'
        }
      }
    });

    // El agregado y el total reflejan el evento completo, sin filtros ni paginación.
    const all = await this.dbRepository.findMany({
      entity: 'event_expense',
      where: { eventUuid, isDeleted: IsNull() } as any
    });

    const totals = new Map<string, number>();
    let grandTotal = 0;
    for (const row of all as any[]) {
      const amount = Number(row.totalAmount);
      totals.set(row.category, (totals.get(row.category) ?? 0) + amount);
      grandTotal += amount;
    }

    return {
      items: result.items as unknown as TEventExpense[],
      byCategory: [...totals.entries()]
        .map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 }))
        .sort((a, b) => b.total - a.total),
      meta: new PaginationMetaResponse({ limit, page, total: result.count }),
      total: Math.round(grandTotal * 100) / 100
    };
  }

  async createExpense(eventUuid: string, data: IExpenseCreate, loggedUser: string): Promise<TEventExpense> {
    await this.assertOwnership(eventUuid, loggedUser);

    const expense = new EventExpenseEntity();
    expense.uuid = uuidv4();
    expense.eventUuid = eventUuid;
    expense.category = data.category;
    expense.concept = data.concept.trim();
    expense.quantity = data.quantity;
    expense.unitCost = data.unitCost;
    expense.totalAmount = this.computeTotal(data.quantity, data.unitCost);
    // La fecha viaja como string YYYY-MM-DD y se guarda tal cual
    expense.expenseDate = data.expenseDate as unknown as Date;
    expense.notes = data.notes?.trim() || null;
    expense.createdBy = loggedUser;

    await this.dbRepository.create({ entity: 'event_expense', data: expense });
    return expense as unknown as TEventExpense;
  }

  async updateExpense(
    eventUuid: string,
    expenseUuid: string,
    data: IExpenseUpdate,
    loggedUser: string
  ): Promise<TEventExpense> {
    await this.assertOwnership(eventUuid, loggedUser);
    const current = await this.findExpenseOrFail(eventUuid, expenseUuid);

    const patch: Record<string, unknown> = {};
    if (data.category !== undefined) patch.category = data.category;
    if (data.concept !== undefined) patch.concept = data.concept.trim();
    if (data.quantity !== undefined) patch.quantity = data.quantity;
    if (data.unitCost !== undefined) patch.unitCost = data.unitCost;
    if (data.expenseDate !== undefined) patch.expenseDate = data.expenseDate;
    if (data.notes !== undefined) patch.notes = data.notes?.trim() || null;

    // El total se recalcula si cambió cualquiera de los dos factores, aunque
    // solo haya venido uno: si no, quedaría desalineado con el detalle.
    if (data.quantity !== undefined || data.unitCost !== undefined) {
      patch.totalAmount = this.computeTotal(
        data.quantity ?? Number(current.quantity),
        data.unitCost ?? Number(current.unitCost)
      );
    }

    if (Object.keys(patch).length > 0) {
      await this.dbRepository.update({
        entity: 'event_expense',
        where: { uuid: expenseUuid } as any,
        data: patch as any
      });
    }

    return this.findExpenseOrFail(eventUuid, expenseUuid);
  }

  /** Baja lógica: el histórico de costos se conserva para auditoría. */
  async deleteExpense(eventUuid: string, expenseUuid: string, loggedUser: string): Promise<void> {
    await this.assertOwnership(eventUuid, loggedUser);
    await this.findExpenseOrFail(eventUuid, expenseUuid);
    await this.dbRepository.update({
      entity: 'event_expense',
      where: { uuid: expenseUuid } as any,
      data: { isDeleted: new Date() } as any
    });
  }

  /** Redondeo a 2 decimales para que la suma de líneas cierre con el total. */
  private computeTotal(quantity: number, unitCost: number): number {
    return Math.round(quantity * unitCost * 100) / 100;
  }

  private async findExpenseOrFail(eventUuid: string, expenseUuid: string): Promise<TEventExpense> {
    const expense = await this.dbRepository.findOne({
      entity: 'event_expense',
      where: { uuid: expenseUuid, eventUuid, isDeleted: IsNull() } as any
    });
    if (!expense) throw new BadRequestException('Gasto no encontrado');
    return expense as unknown as TEventExpense;
  }
}
