import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { ILike, In, IsNull, MoreThan, MoreThanOrEqual, Or } from 'typeorm';
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
import { EventMediaEntity } from '@config/db/entities/tickets/event_media.entity';
import { TicketTypeEntity } from '@config/db/entities/tickets/ticket_type.entity';
import { EventProducerEntity } from '@config/db/entities/tickets/event_producer.entity';
import { EventValidatorEntity } from '@config/db/entities/tickets/event_validator.entity';
import { UserOrganizationEntity } from '@config/db/entities/user/user_organization.entity';
import { UserRoleEntity } from '@config/db/entities/user/user_role.entity';
import { FeeSummaryService } from '@modules/orders/services/implementation/fee-summary.service';
import { EventFeeSummary } from '@modules/orders/services/core/fee-summary';
import { ORGANIZATION_STATUS } from '@modules/organization/const/organization-fiscal.const';
import {
  BANNER_VARIANTS,
  BannerImages,
  BannerVariant
} from '../../controllers/const/banner-variant.const';
import {
  IEventService,
  TEventFilters,
  TEventMediaItem,
  TEventProducer,
  TEventValidator,
  TUserSummary,
  TEventListItem,
  TEventResponse,
  TEventWithTicketTypesResponse,
  TTicketTypeResponse
} from '../contracts/ievent.service';
import { IEventCreate, IEventUpdate, ITicketTypeCreate, ITicketTypeUpdate } from '../core/event';

const BANNERS_BASE_PATH = 'events/banners';
const GALLERY_BASE_PATH = 'events/gallery';
const MAX_GALLERY_ITEMS = 4;
const MAX_GALLERY_UPLOAD_BYTES = 20 * 1024 * 1024;

@Injectable()
export class EventService implements IEventService {
  constructor(
    @Inject(DBRepository) private readonly dbRepository: DBRepository,
    private readonly redisService: RedisService,
    private readonly userPermission: UserPermissionService,
    private readonly feeSummaryService: FeeSummaryService,
    private readonly storageService: StorageService
  ) {}

  async getEvents(
    pagination: IPaginationParams,
    search: ISearchParams,
    filters: TEventFilters,
    role: string | null,
    options?: { mine?: boolean; loggedUser?: string | null }
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

        return this.runEventsQuery(scoped, filters, pagination);
      }
    } else {
      // Vista pública: solo publicados y que todavía no terminaron. Se filtra por
      // endDate (no startDate) para que un evento en curso siga visible.
      where['isPublished'] = true;
      where['endDate'] = MoreThanOrEqual(new Date());
    }

    if (filters.city?.length) {
      where['venueCity'] = filters.city.length === 1
        ? ILike(`%${filters.city[0]}%`)
        : Or(...filters.city.map(c => ILike(`%${c}%`)));
    }
    if (filters.country?.length) {
      where['venueCountry'] = filters.country.length === 1
        ? ILike(`%${filters.country[0]}%`)
        : Or(...filters.country.map(c => ILike(`%${c}%`)));
    }
    if (filters.organizationUuid?.length) where['organizationUuid'] = In(filters.organizationUuid);

    const result = await this.dbRepository.findManyAndCount({
      entity: 'event',
      where: where as any,
      other: {
        take: pagination.limit,
        skip: (pagination.page - 1) * pagination.limit,
        order: { startDate: 'ASC' }
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
    event.venueName = data.venueName;
    event.venueAddress = data.venueAddress;
    event.venueCity = data.venueCity;
    event.venueCountry = data.venueCountry;
    event.googleMapsUrl = data.googleMapsUrl ?? null;
    event.maxCapacity = data.maxCapacity;

    await this.dbRepository.create({ entity: 'event', data: event });
    return { uuid: event.uuid };
  }

  async updateEvent(uuid: string, data: IEventUpdate, loggedUser: string): Promise<void> {
    const event = await this.assertOwnership(uuid, loggedUser);

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
    if (data.googleMapsUrl !== undefined) patch.googleMapsUrl = data.googleMapsUrl;
    if (data.maxCapacity !== undefined) patch.maxCapacity = data.maxCapacity;

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

    if (event.isPublished) {
      throw new BadRequestException('No se pueden agregar tipos de entrada a un evento ya publicado');
    }

    const ticketType = new TicketTypeEntity();
    ticketType.uuid = uuidv4();
    ticketType.eventUuid = event.uuid;
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

    return saved as TTicketTypeResponse;
  }

  async updateTicketType(
    eventUuid: string,
    ticketTypeUuid: string,
    data: ITicketTypeUpdate,
    loggedUser: string
  ): Promise<TTicketTypeResponse> {
    await this.assertOwnership(eventUuid, loggedUser);

    const ticketType = await this.dbRepository.findOne({
      entity: 'ticket_type',
      where: { uuid: ticketTypeUuid, eventUuid, isActive: true }
    });
    if (!ticketType) throw new BadRequestException('Tipo de entrada no encontrado');

    const soldCount = ticketType.quantity - ticketType.availableQuantity;

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
    }

    return this.dbRepository.findOne({
      entity: 'ticket_type',
      where: { uuid: ticketTypeUuid }
    }) as Promise<TTicketTypeResponse>;
  }

  async deleteTicketType(eventUuid: string, ticketTypeUuid: string, loggedUser: string): Promise<void> {
    const event = await this.assertOwnership(eventUuid, loggedUser);

    if (event.isPublished) {
      throw new BadRequestException('No se pueden eliminar tipos de entrada de un evento publicado');
    }

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

    const spec = BANNER_VARIANTS[variant];

    // Normalizar a webp con la relación de aspecto de la variante.
    // `cover` recorta centrado en lugar de deformar; `withoutEnlargement` evita
    // escalar hacia arriba una imagen chica (quedaría pixelada).
    let processed: Buffer;
    try {
      processed = await sharp(file.buffer)
        .resize({
          width: spec.width,
          height: spec.height,
          fit: 'cover',
          position: 'centre',
          withoutEnlargement: false
        })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      throw new BadRequestException('El archivo no es una imagen válida');
    }

    // Un directorio por evento; nombre versionado por timestamp para invalidar cache
    // del browser/CDN al reemplazar una variante.
    const relativePath = `${BANNERS_BASE_PATH}/${event.uuid}`;
    const filename = `${variant}-${Date.now()}.webp`;

    const { url } = await this.storageService.saveFile({ buffer: processed, relativePath, filename });

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

  private async runEventsQuery(
    conditions: Record<string, unknown>[],
    filters: TEventFilters,
    pagination: IPaginationParams
  ): Promise<{ meta: PaginationMetaResponse; items: TEventListItem[] }> {
    const withFilters = conditions.map(cond => {
      const c = { ...cond };
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
      return c;
    });

    const result = await this.dbRepository.findManyAndCount({
      entity: 'event',
      where: withFilters as any,
      other: {
        take: pagination.limit,
        skip: (pagination.page - 1) * pagination.limit,
        order: { startDate: 'ASC' }
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
}
