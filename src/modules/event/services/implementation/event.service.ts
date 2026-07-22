import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { ILike, In, IsNull, Or } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DBRepository } from '@config/db/db.repository';
import { RedisService } from '@config/redis/redis.service';
import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { ISearchParams } from '@root/shared/decorators/search-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { UserPermissionService } from '@root/shared/services/userPermissions.service';
import { EventEntity } from '@config/db/entities/tickets/event.entity';
import { TicketTypeEntity } from '@config/db/entities/tickets/ticket_type.entity';
import { FeeSummaryService } from '@modules/orders/services/implementation/fee-summary.service';
import { EventFeeSummary } from '@modules/orders/services/core/fee-summary';
import {
  IEventService,
  TEventFilters,
  TEventResponse,
  TEventWithTicketTypesResponse,
  TTicketTypeResponse
} from '../contracts/ievent.service';
import { IEventCreate, IEventUpdate, ITicketTypeCreate, ITicketTypeUpdate } from '../core/event';

@Injectable()
export class EventService implements IEventService {
  constructor(
    @Inject(DBRepository) private readonly dbRepository: DBRepository,
    private readonly redisService: RedisService,
    private readonly userPermission: UserPermissionService,
    private readonly feeSummaryService: FeeSummaryService
  ) {}

  async getEvents(
    pagination: IPaginationParams,
    search: ISearchParams,
    filters: TEventFilters,
    role: string | null
  ): Promise<{ meta: PaginationMetaResponse; items: TEventResponse[] }> {
    const isAdmin = role === 'Administrador';
    const where: Record<string, unknown> = {
      isActive: true,
      name: ILike(`%${search.search}%`),
      ...(!isAdmin && { isPublished: true })
    };

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

    return { meta, items: result.items as TEventResponse[] };
  }

  async getEventById(uuid: string): Promise<TEventWithTicketTypesResponse> {
    const event = await this.dbRepository.findOne({
      entity: 'event',
      where: { uuid, isActive: true },
      relations: { ticketTypes: true }
    });

    if (!event) throw new BadRequestException('Evento no encontrado');

    return event as TEventWithTicketTypesResponse;
  }

  async createEvent(data: IEventCreate, loggedUser: string): Promise<boolean> {
    const org = await this.dbRepository.findOne({
      entity: 'organization',
      where: { uuid: data.organizationUuid, isDeleted: IsNull() }
    });
    if (!org) throw new BadRequestException('Organización no encontrada');

    await this.assertOrganizationMembership(data.organizationUuid, loggedUser);

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
    event.maxCapacity = data.maxCapacity;

    await this.dbRepository.create({ entity: 'event', data: event });
    return true;
  }

  async updateEvent(uuid: string, data: IEventUpdate, loggedUser: string): Promise<void> {
    const event = await this.assertOwnership(uuid, loggedUser);

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
    if (data.maxCapacity !== undefined) patch.maxCapacity = data.maxCapacity;

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

    await this.dbRepository.update({ entity: 'event', where: { uuid: event.uuid }, data: { isPublished: true } });
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
    const event = await this.assertOwnership(eventUuid, loggedUser);

    if (event.isPublished) {
      throw new BadRequestException('No se puede modificar el precio de un evento ya publicado');
    }

    const ticketType = await this.dbRepository.findOne({
      entity: 'ticket_type',
      where: { uuid: ticketTypeUuid, eventUuid, isActive: true }
    });
    if (!ticketType) throw new BadRequestException('Tipo de entrada no encontrado');

    const patch: Partial<TicketTypeEntity> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.minPerOrder !== undefined) patch.minPerOrder = data.minPerOrder;
    if (data.maxPerOrder !== undefined) patch.maxPerOrder = data.maxPerOrder;
    if (data.saleStartDate !== undefined) patch.saleStartDate = data.saleStartDate;
    if (data.saleEndDate !== undefined) patch.saleEndDate = data.saleEndDate;
    if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder;

    await this.dbRepository.update({ entity: 'ticket_type', where: { uuid: ticketTypeUuid }, data: patch });

    return this.dbRepository.findOne({
      entity: 'ticket_type',
      where: { uuid: ticketTypeUuid }
    }) as Promise<TTicketTypeResponse>;
  }

  async getFeeSummary(eventUuid: string, loggedUser: string): Promise<EventFeeSummary | null> {
    // Autoriza: solo el organizador dueño del evento o un admin. Lanza si no.
    await this.assertOwnership(eventUuid, loggedUser);
    // Puede ser null si el evento todavía no tiene ventas pagadas — el caller
    // (DTO) mapea null a ceros en lugar de 404.
    return this.feeSummaryService.getSummaryByEvent(eventUuid);
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
    if (!membership) throw new ForbiddenException('No tenés permiso para modificar este evento');

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
