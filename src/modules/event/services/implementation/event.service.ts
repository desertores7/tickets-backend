import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Between, ILike, In, IsNull, LessThanOrEqual, MoreThan, MoreThanOrEqual, Not, Or } from 'typeorm';
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
import { EventMediaEntity } from '@config/db/entities/tickets/event_media.entity';
import { TicketTypeEntity } from '@config/db/entities/tickets/ticket_type.entity';
import { EventProducerEntity } from '@config/db/entities/tickets/event_producer.entity';
import { EventValidatorEntity } from '@config/db/entities/tickets/event_validator.entity';
import { EventExpenseEntity } from '@config/db/entities/tickets/event_expense.entity';
import { UserOrganizationEntity } from '@config/db/entities/user/user_organization.entity';
import { UserRoleEntity } from '@config/db/entities/user/user_role.entity';
import { FeeSummaryService } from '@modules/orders/services/implementation/fee-summary.service';
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
  TEventValidator,
  TUserSummary,
  TEventListItem,
  TEventResponse,
  TEventWithTicketTypesResponse,
  TTicketTypeResponse
} from '../contracts/ievent.service';
import { IEventCreate, IEventUpdate, ITicketTypeCreate, ITicketTypeUpdate, ITicketTypeBulkUpdate } from '../core/event';
import { normalizeLineup } from '../core/event-change.helpers';
import { EventChangeService, toEventSnapshot, TEventChangeItem, TEventChangesResult } from './event-change.service';
import { IStockAlertService } from '@modules/stock-alerts/services/contracts/istock-alert.service';
import { EventMapEntity } from '@config/db/entities/tickets/event_map.entity';
import {
  EventMapSectorEntity,
  EventMapSectorGeometry
} from '@config/db/entities/tickets/event_map_sector.entity';
import { EventMapSectorTicketTypeEntity } from '@config/db/entities/tickets/event_map_sector_ticket_type.entity';

const BANNERS_BASE_PATH = 'events/banners';
const GALLERY_BASE_PATH = 'events/gallery';
const MAPS_BASE_PATH = 'events/maps';
const MAX_GALLERY_ITEMS = 4;
const MAX_GALLERY_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_MAP_BASE_BYTES = 8 * 1024 * 1024;

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
      name: ILike(`%${search.search}%`)
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
      // Vista pública: solo publicados y que todavía no terminaron. Se filtra por
      // endDate (no startDate) para que un evento en curso siga visible.
      where['isPublished'] = true;
      where['endDate'] = MoreThanOrEqual(new Date());
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

  async getEventById(uuid: string, role?: string | null): Promise<TEventWithTicketTypesResponse> {
    const event = await this.dbRepository.findOne({
      entity: 'event',
      where: { uuid, isActive: true },
      relations: { ticketTypes: true }
    });

    if (!event) throw new BadRequestException('Evento no encontrado');

    // Los borradores no se exponen a visitantes anónimos (endpoint público).
    // Los usuarios autenticados mantienen el acceso: el backoffice los necesita.
    if (!event.isPublished && !role) throw new BadRequestException('Evento no encontrado');

    return event as TEventWithTicketTypesResponse;
  }

  async getEventBySlug(slug: string, role?: string | null): Promise<TEventWithTicketTypesResponse> {
    const normalized = (slug ?? '').trim();
    if (!normalized) throw new BadRequestException('Evento no encontrado');

    const event = await this.dbRepository.findOne({
      entity: 'event',
      where: { slug: normalized, isActive: true },
      relations: { ticketTypes: true }
    });

    if (!event) throw new BadRequestException('Evento no encontrado');
    if (!event.isPublished && !role) throw new BadRequestException('Evento no encontrado');

    return event as TEventWithTicketTypesResponse;
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

    const existing = await this.dbRepository.findOne({
      entity: 'event',
      where: { slug: data.slug }
    });
    if (existing) throw new BadRequestException('El slug ya está en uso');

    const event = new EventEntity();
    event.uuid = uuidv4();
    event.name = data.name;
    event.description = data.description ?? null;
    event.slug = data.slug;
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
      if (event.isPublished) {
        throw new BadRequestException('No se puede cambiar el slug de un evento publicado');
      }
      const slugTaken = await this.dbRepository.findOne({
        entity: 'event',
        where: { slug: data.slug }
      });
      if (slugTaken) throw new BadRequestException('El slug ya está en uso');
      patch.slug = data.slug;
    }

    await this.dbRepository.update({ entity: 'event', where: { uuid: event.uuid }, data: patch });

    // Historial + email/ventana 72 h si el cambio es material y hay ventas (FP10).
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

    // availableQuantity baja al confirmar pago: si quantity > available hay venta real.
    // No se permite ocultar el evento (parecería una estafa para quien ya compró).
    const ticketTypes = (await this.dbRepository.findMany({
      entity: 'ticket_type',
      where: { eventUuid: event.uuid }
    })) as TicketTypeEntity[];

    const hasSales = ticketTypes.some((tt) => tt.quantity > tt.availableQuantity);
    if (hasSales) {
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

    const created: TTicketTypeResponse[] = [];
    for (const data of items) {
      created.push(await this.persistNewTicketType(event.uuid, data));
    }
    return created;
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
      await this.assertOwnership(eventUuid, loggedUser);
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
      url: row.url,
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
      url: media.url,
      mimeType: media.mimeType,
      createdAt: media.createdAt ?? new Date()
    };
  }

  async deleteEventMedia(eventUuid: string, mediaUuid: string, loggedUser: string): Promise<void> {
    await this.assertOwnership(eventUuid, loggedUser);

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

    if (media.url?.includes(`/static/${GALLERY_BASE_PATH}/${eventUuid}/`)) {
      const filename = media.url.split('/').pop();
      if (filename) {
        await this.storageService.deleteFile(
          this.storageService.resolveAbsolutePath(`${GALLERY_BASE_PATH}/${eventUuid}`, filename)
        );
      }
    }
  }

  async getFeeSummary(eventUuid: string, loggedUser: string): Promise<EventFeeSummary | null> {
    // Autoriza: solo el organizador dueño del evento o un admin. Lanza si no.
    await this.assertOwnership(eventUuid, loggedUser);
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

    return { variant, url, bannerImages };
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

    return { bannerImages };
  }

  async getEventMap(eventUuid: string, loggedUser: string): Promise<TEventMap | null> {
    await this.assertOwnership(eventUuid, loggedUser);
    const map = await this.dbRepository.findOne({
      entity: 'event_map',
      where: { eventUuid }
    });
    if (!map) return null;
    return this.loadEventMap(map);
  }

  async getEventMapPublic(
    eventUuid: string,
    opts?: { loggedUser?: string | null; role?: string | null }
  ): Promise<TEventMap | null> {
    const event = await this.dbRepository.findOne({
      entity: 'event',
      where: { uuid: eventUuid, isActive: true }
    });
    if (!event) throw new BadRequestException('Evento no encontrado');

    if (!event.isPublished) {
      if (!opts?.loggedUser) throw new BadRequestException('Evento no encontrado');
      await this.assertOwnership(eventUuid, opts.loggedUser);
    }

    const map = await this.dbRepository.findOne({
      entity: 'event_map',
      where: { eventUuid }
    });
    if (!map) return null;
    return this.loadEventMap(map);
  }

  async upsertEventMap(eventUuid: string, data: TUpsertEventMap, loggedUser: string): Promise<TEventMap> {
    const event = await this.assertOwnership(eventUuid, loggedUser);
    this.assertUniqueSectorNames(data.sectors);
    await this.validateSectorTicketTypes(event.uuid, data.sectors);

    let map = await this.dbRepository.findOne({
      entity: 'event_map',
      where: { eventUuid: event.uuid }
    });

    if (!map) {
      const created = new EventMapEntity();
      created.uuid = uuidv4();
      created.eventUuid = event.uuid;
      created.name = data.name?.trim() || 'Mapa del evento';
      created.baseImageUrl = data.baseImageUrl ?? null;
      created.canvasWidth = data.canvasWidth ?? 1000;
      created.canvasHeight = data.canvasHeight ?? 1000;
      created.createdBy = loggedUser;
      await this.dbRepository.create({ entity: 'event_map', data: created });
      map = created;
    } else {
      const patch: Partial<EventMapEntity> = {};
      if (data.name !== undefined) patch.name = data.name.trim() || map.name;
      if (data.canvasWidth !== undefined) patch.canvasWidth = data.canvasWidth;
      if (data.canvasHeight !== undefined) patch.canvasHeight = data.canvasHeight;
      if (data.baseImageUrl !== undefined) patch.baseImageUrl = data.baseImageUrl;
      if (Object.keys(patch).length) {
        await this.dbRepository.update({
          entity: 'event_map',
          where: { uuid: map.uuid },
          data: patch
        });
        map = { ...map, ...patch };
      }
    }

    await this.replaceMapSectors(map.uuid, data.sectors);
    return this.loadEventMap(map);
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
  }): Promise<TEventMap> {
    const sectors = await this.dbRepository.findMany({
      entity: 'event_map_sector',
      where: { mapUuid: map.uuid },
      other: { order: { sortOrder: 'ASC', createdAt: 'ASC' } }
    });

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

    const mappedSectors: TEventMapSector[] = sectors.map(s => ({
      uuid: s.uuid,
      name: s.name,
      geometry: s.geometry,
      sortOrder: s.sortOrder,
      isNumbered: !!s.isNumbered,
      capacity: s.capacity ?? null,
      ticketTypeUuids: bySector.get(s.uuid) ?? []
    }));

    return {
      uuid: map.uuid,
      eventUuid: map.eventUuid,
      name: map.name,
      baseImageUrl: map.baseImageUrl,
      canvasWidth: map.canvasWidth,
      canvasHeight: map.canvasHeight,
      sectors: mappedSectors
    };
  }

  /**
   * Dos sectores con el mismo nombre en un mapa se leen como el mismo lugar:
   * la vista los agrupa y la misma mesa terminaria vendiendose dos veces. Se
   * compara sin distinguir mayusculas ni espacios de mas.
   */
  private assertUniqueSectorNames(sectors: TUpsertEventMap['sectors']): void {
    const seen = new Map<string, string>();
    for (const sector of sectors) {
      const name = sector.name?.trim() ?? '';
      if (!name) continue;
      const key = name.toLowerCase().replace(/\s+/g, ' ');
      const previous = seen.get(key);
      if (previous) {
        throw new BadRequestException(`El mapa tiene dos sectores llamados "${previous}"`);
      }
      seen.set(key, name);
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

  private async replaceMapSectors(
    mapUuid: string,
    sectors: TUpsertEventMap['sectors']
  ): Promise<void> {
    // Los vinculos con tandas se van solos: la FK es ON DELETE CASCADE. Leer
    // los sectores para borrarlos por lista era una consulta al pedo.
    await this.dbRepository.delete({
      entity: 'event_map_sector',
      where: { mapUuid } as any
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
      sector.geometry = this.normalizeSectorGeometry(src.geometry);
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
        data: newSectors as never
      });
    }
    if (newLinks.length) {
      await this.dbRepository.createMany({
        entity: 'event_map_sector_ticket_type',
        data: newLinks as never
      });
    }
  }

  private normalizeSectorGeometry(raw: EventMapSectorGeometry): EventMapSectorGeometry {
    const color = raw.color?.trim() || undefined;
    if (raw.type === 'polygon') {
      const points = (raw.points ?? [])
        .map(p => ({
          x: Math.min(1, Math.max(0, Number(p.x))),
          y: Math.min(1, Math.max(0, Number(p.y)))
        }))
        .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
      if (points.length < 3) {
        throw new BadRequestException('Un polígono necesita al menos 3 puntos');
      }
      return { type: 'polygon', points, ...(color ? { color } : {}) };
    }

    const x = Math.min(1, Math.max(0, Number(raw.x)));
    const y = Math.min(1, Math.max(0, Number(raw.y)));
    const w = Math.min(1, Math.max(0.01, Number(raw.w)));
    const h = Math.min(1, Math.max(0.01, Number(raw.h)));
    if (![x, y, w, h].every(Number.isFinite)) {
      throw new BadRequestException('Geometría de sector inválida');
    }
    return {
      type: raw.type === 'ellipse' ? 'ellipse' : 'rect',
      x,
      y,
      w,
      h,
      ...(color ? { color } : {})
    };
  }

  private async removeStoredMapBase(eventUuid: string, url: string | undefined): Promise<void> {
    if (!url?.includes(`/static/${MAPS_BASE_PATH}/${eventUuid}/`)) return;
    const filename = url.split('/').pop();
    if (!filename) return;
    await this.storageService.deleteFile(
      this.storageService.resolveAbsolutePath(`${MAPS_BASE_PATH}/${eventUuid}`, filename)
    );
  }

  /** Borra del volumen una imagen previa, solo si es un archivo servido por nosotros. */
  private async removeStoredBanner(eventUuid: string, url: string | undefined): Promise<void> {
    if (!url?.includes(`/static/${BANNERS_BASE_PATH}/${eventUuid}/`)) return;
    const filename = url.split('/').pop();
    if (!filename) return;
    await this.storageService.deleteFile(
      this.storageService.resolveAbsolutePath(`${BANNERS_BASE_PATH}/${eventUuid}`, filename)
    );
  }

  async getEventProducers(eventUuid: string, loggedUser: string): Promise<TEventProducer[]> {
    await this.assertOwnership(eventUuid, loggedUser);

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

  // ── Validadores del evento ────────────────────────────────────────────────

  async getEventValidators(eventUuid: string, loggedUser: string): Promise<TEventValidator[]> {
    await this.assertOwnership(eventUuid, loggedUser);

    const rows = await this.dbRepository.findMany({
      entity: 'event_validator',
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
   * Candidatos a validador: cualquier usuario activo que no esté ya asignado.
   *
   * Existe como endpoint propio del evento en lugar de reusar `GET /users`
   * porque ese listado es solo para administradores, y acá también tiene que
   * poder buscar un productor sobre su propio evento.
   */
  async getValidatorCandidates(eventUuid: string, search: string, loggedUser: string): Promise<TUserSummary[]> {
    await this.assertOwnership(eventUuid, loggedUser);

    const term = search?.trim();
    if (!term) return [];

    const assigned = await this.dbRepository.findMany({
      entity: 'event_validator',
      where: { eventUuid } as any
    });
    const assignedUuids = new Set(assigned.map((a: any) => a.userUuid));

    // Se busca por nombre, apellido o email: en la puerta se lo suele identificar
    // por el correo con el que se registró.
    const users = await this.dbRepository.findMany({
      entity: 'user',
      where: [
        { firstName: ILike(`%${term}%`), isDeleted: IsNull(), active: 1 },
        { lastName: ILike(`%${term}%`), isDeleted: IsNull(), active: 1 },
        { email: ILike(`%${term}%`), isDeleted: IsNull(), active: 1 }
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

  async assignValidatorToEvent(eventUuid: string, userUuid: string, loggedUser: string): Promise<void> {
    const event = await this.assertOwnership(eventUuid, loggedUser);

    const user = await this.dbRepository.findOne({
      entity: 'user',
      where: { uuid: userUuid, isDeleted: IsNull() }
    });
    if (!user) throw new BadRequestException('Usuario no encontrado');

    const existing = await this.dbRepository.findOne({
      entity: 'event_validator',
      where: { eventUuid, userUuid } as any
    });

    if (!existing) {
      const assignment = new EventValidatorEntity();
      assignment.uuid = uuidv4();
      assignment.eventUuid = eventUuid;
      assignment.userUuid = userUuid;
      assignment.assignedBy = loggedUser;
      await this.dbRepository.create({ entity: 'event_validator', data: assignment });
    }

    await this.grantValidatorRole(userUuid, loggedUser);

    // El alcance del validador se define por organización: sin esta membresía
    // no vería el evento en el escáner ni podría validar sus entradas.
    await this.linkUserToOrganization(userUuid, event.organizationUuid);
  }

  /**
   * Otorga el rol `Validador` si el usuario no lo tiene. El flujo esperado es
   * que la persona se registre como Cliente y acá se la habilite para escanear;
   * sin esto quedaría asignada al evento pero el check-in le daría 403.
   *
   * El rol se busca por nombre y no por UUID: los UUIDs de los roles base
   * difieren entre bases (los seeds matchearon filas preexistentes por nombre).
   */
  private async grantValidatorRole(userUuid: string, assignedBy: string): Promise<void> {
    // Un administrador ya pasa @ValidatorAuth: sumarle el rol Validador solo
    // le agrega un segundo rol activo y confunde a la sesión, que maneja uno.
    const currentRoles = await this.dbRepository.findMany({
      entity: 'user_role',
      where: { userUuid, isDeleted: IsNull() } as any,
      relations: { role: true } as any
    });
    if (currentRoles.some((ur: any) => ur.role?.name === 'Administrador')) return;

    const role = await this.dbRepository.findOne({
      entity: 'role',
      where: { name: 'Validador', isDeleted: IsNull() } as any
    });
    if (!role) throw new BadRequestException('No existe el rol Validador en el sistema');

    const existing = await this.dbRepository.findOne({
      entity: 'user_role',
      where: { userUuid, roleUuid: role.uuid } as any
    });

    if (!existing) {
      const link = new UserRoleEntity();
      link.uuid = uuidv4();
      link.userUuid = userUuid;
      link.roleUuid = role.uuid;
      link.createdBy = assignedBy;
      await this.dbRepository.create({ entity: 'user_role', data: link });
    } else if (existing.isDeleted) {
      await this.dbRepository.update({
        entity: 'user_role',
        where: { uuid: existing.uuid } as any,
        data: { isDeleted: null, updatedBy: assignedBy }
      });
    }
  }

  /**
   * Quita la asignación al evento. NO revoca el rol `Validador`: la persona
   * puede estar trabajando la puerta de otros shows.
   */
  async removeValidatorFromEvent(eventUuid: string, userUuid: string, loggedUser: string): Promise<void> {
    await this.assertOwnership(eventUuid, loggedUser);
    await this.dbRepository.delete({ entity: 'event_validator', where: { eventUuid, userUuid } as any });
  }

  /** Aplica los filtros de la query y ejecuta la búsqueda paginada */
  /**
   * Marca cada evento como agotado o no con UNA sola consulta para toda la
   * página (nada de una por tarjeta).
   *
   * Se mira `availableQuantity` de MySQL, que baja recién al confirmarse el
   * pago. Las reservas en Redis sin pagar no cuentan como vendidas: expiran a
   * los 10 minutos y volverían a estar disponibles.
   */
  private async attachSoldOut(events: TEventResponse[]): Promise<TEventListItem[]> {
    if (events.length === 0) return [];

    const eventUuids = events.map(e => e.uuid);

    const [ticketTypes, galleryImages] = await Promise.all([
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
    const coverByEvent = new Map<string, string>();
    for (const row of galleryImages) {
      if (!coverByEvent.has(row.eventUuid) && row.url) {
        coverByEvent.set(row.eventUuid, row.url);
      }
    }

    return events.map(event => ({
      ...event,
      soldOut: withAnyType.has(event.uuid) && !withStock.has(event.uuid),
      coverUrl: coverByEvent.get(event.uuid) ?? null
    }));
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
        filters.city.length === 1 ? ILike(`%${filters.city[0]}%`) : Or(...filters.city.map(x => ILike(`%${x}%`)));
    }
    if (filters.country?.length) {
      c['venueCountry'] =
        filters.country.length === 1
          ? ILike(`%${filters.country[0]}%`)
          : Or(...filters.country.map(x => ILike(`%${x}%`)));
    }
    if (filters.organizationUuid?.length) c['organizationUuid'] = In(filters.organizationUuid);

    const status = filters.status?.[0];
    if (status === 'draft') {
      c['isPublished'] = false;
      c['cancelledAt'] = IsNull();
    } else if (status === 'published') {
      c['isPublished'] = true;
      c['cancelledAt'] = IsNull();
    } else if (status === 'cancelled') {
      c['cancelledAt'] = Not(IsNull());
    } else if (status === 'sales_closed') {
      c['salesClosedAt'] = Not(IsNull());
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
  private async getAssignedEventUuids(loggedUser?: string | null): Promise<string[]> {
    if (!loggedUser) return [];
    const [asProducer, asValidator] = await Promise.all([
      this.dbRepository.findMany({ entity: 'event_producer', where: { userUuid: loggedUser } as any }),
      this.dbRepository.findMany({ entity: 'event_validator', where: { userUuid: loggedUser } as any })
    ]);
    return [...new Set([...asProducer, ...asValidator].map(r => r.eventUuid))];
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

  private async assertOwnership(eventUuid: string, loggedUser: string): Promise<TEventResponse> {
    const event = await this.dbRepository.findOne({
      entity: 'event',
      where: { uuid: eventUuid, isActive: true }
    });
    if (!event) throw new BadRequestException('Evento no encontrado');

    const isAdmin = await this.userPermission.userPermission(loggedUser);
    if (isAdmin) return event as TEventResponse;

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
    filters?: { category?: string; supplier?: string }
  ): Promise<{ items: TEventExpense[]; byCategory: { category: string; total: number }[] }> {
    await this.assertOwnership(eventUuid, loggedUser);

    const where: Record<string, unknown> = { eventUuid, isDeleted: IsNull() };
    if (filters?.category) where.category = filters.category;
    if (filters?.supplier) where.supplier = ILike(`%${filters.supplier}%`);

    const rows = await this.dbRepository.findMany({
      entity: 'event_expense',
      where: where as any,
      other: { order: { expenseDate: 'DESC', createdAt: 'DESC' } }
    });

    // El agregado se calcula SIN los filtros: el desglose por categoría del
    // dashboard tiene que reflejar el total del evento, no la vista filtrada.
    const all = filters?.category || filters?.supplier
      ? await this.dbRepository.findMany({ entity: 'event_expense', where: { eventUuid, isDeleted: IsNull() } as any })
      : rows;

    const totals = new Map<string, number>();
    for (const row of all as any[]) {
      totals.set(row.category, (totals.get(row.category) ?? 0) + Number(row.totalAmount));
    }

    return {
      items: rows as unknown as TEventExpense[],
      byCategory: [...totals.entries()]
        .map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 }))
        .sort((a, b) => b.total - a.total)
    };
  }

  async createExpense(eventUuid: string, data: IExpenseCreate, loggedUser: string): Promise<TEventExpense> {
    await this.assertOwnership(eventUuid, loggedUser);

    const expense = new EventExpenseEntity();
    expense.uuid = uuidv4();
    expense.eventUuid = eventUuid;
    expense.category = data.category;
    expense.concept = data.concept.trim();
    expense.supplier = data.supplier.trim();
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
    if (data.supplier !== undefined) patch.supplier = data.supplier.trim();
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
