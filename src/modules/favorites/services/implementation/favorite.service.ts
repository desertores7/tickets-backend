import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common';
import { IsNull, LessThan, Like, MoreThanOrEqual } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DBRepository } from '@config/db/db.repository';
import { UserEventFavoriteEntity } from '@config/db/entities/tickets/user_event_favorite.entity';
import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { ISearchParams } from '@root/shared/decorators/search-query.decorator';
import { resolveListOrder } from '@root/shared/decorators/order-query.decorator';
import {
  FAVORITE_ORDER_COLUMNS,
  TFavoriteTimeframe
} from '../../controllers/const/favorite.filters';
import {
  IFavoriteService,
  TFavoriteEventCard,
  TFavoriteFilters,
  TFavoriteItem,
  TFavoriteOrder,
  TFavoritesPage
} from '../contracts/ifavorite.service';

type FavoriteWithEvent = UserEventFavoriteEntity & {
  event: {
    uuid: string;
    slug: string;
    name: string;
    description: string | null;
    bannerUrl: string | null;
    startDate: Date;
    endDate: Date;
    venueName: string;
    venueCity: string | null;
    venueAddress: string | null;
  };
};

@Injectable()
export class FavoriteService implements IFavoriteService {
  constructor(@Inject(DBRepository) private readonly dbRepository: DBRepository) {}

  async listMine(
    userUuid: string,
    pagination: IPaginationParams,
    search: ISearchParams,
    filters: TFavoriteFilters,
    order: TFavoriteOrder
  ): Promise<TFavoritesPage> {
    const { page, limit } = pagination;
    const timeframe = this.resolveTimeframe(filters.timeframe);
    const now = new Date();

    const eventWhere: Record<string, unknown> = {};
    const term = search?.search?.trim();
    if (term) {
      eventWhere.name = Like(`%${term}%`);
    }
    if (timeframe === 'upcoming') {
      eventWhere.endDate = MoreThanOrEqual(now);
    } else if (timeframe === 'past') {
      eventWhere.endDate = LessThan(now);
    }

    const typeOrmOrder = this.resolveOrder(order, timeframe);

    const { items, count } = await this.dbRepository.findManyAndCount({
      entity: 'user_event_favorite',
      where: {
        userUuid,
        isDeleted: IsNull(),
        ...(Object.keys(eventWhere).length > 0 ? { event: eventWhere } : {})
      },
      relations: { event: true },
      other: {
        order: typeOrmOrder,
        skip: (page - 1) * limit,
        take: limit
      }
    });

    return {
      items: (items as FavoriteWithEvent[]).map(row => this.toItem(row)),
      total: count,
      page,
      limit
    };
  }

  async getStatus(
    userUuid: string,
    eventUuid: string
  ): Promise<{ favorited: boolean; favoriteUuid: string | null }> {
    const row = await this.dbRepository.findOne({
      entity: 'user_event_favorite',
      where: { userUuid, eventUuid, isDeleted: IsNull() }
    });
    return {
      favorited: Boolean(row),
      favoriteUuid: row?.uuid ?? null
    };
  }

  async add(userUuid: string, eventUuid: string): Promise<TFavoriteItem> {
    const event = await this.dbRepository.findOne({
      entity: 'event',
      where: { uuid: eventUuid }
    });
    if (!event) {
      throw new NotFoundException('Evento no encontrado');
    }
    if (!event.isPublished || !event.isActive) {
      throw new UnprocessableEntityException('El evento no está disponible para guardar');
    }

    const existing = await this.dbRepository.findOne({
      entity: 'user_event_favorite',
      where: { userUuid, eventUuid, isDeleted: IsNull() },
      relations: { event: true }
    });
    if (existing) {
      return this.toItem(existing as FavoriteWithEvent);
    }

    // Si hubo soft-delete previo, reactivamos la misma fila unique.
    const softDeleted = await this.dbRepository.findOne({
      entity: 'user_event_favorite',
      where: { userUuid, eventUuid }
    });
    if (softDeleted) {
      await this.dbRepository.update({
        entity: 'user_event_favorite',
        where: { uuid: softDeleted.uuid },
        data: { isDeleted: null, updatedAt: new Date() }
      });
      const restored = await this.dbRepository.findOne({
        entity: 'user_event_favorite',
        where: { uuid: softDeleted.uuid },
        relations: { event: true }
      });
      return this.toItem(restored as FavoriteWithEvent);
    }

    const entity = new UserEventFavoriteEntity();
    entity.uuid = uuidv4();
    entity.userUuid = userUuid;
    entity.eventUuid = eventUuid;
    entity.isDeleted = null;
    entity.createdAt = new Date();
    entity.updatedAt = new Date();

    await this.dbRepository.create({
      entity: 'user_event_favorite',
      data: entity
    });

    const created = await this.dbRepository.findOne({
      entity: 'user_event_favorite',
      where: { uuid: entity.uuid },
      relations: { event: true }
    });
    if (!created) {
      throw new NotFoundException('No se pudo crear el favorito');
    }
    return this.toItem(created as FavoriteWithEvent);
  }

  async remove(userUuid: string, eventUuid: string): Promise<void> {
    const row = await this.dbRepository.findOne({
      entity: 'user_event_favorite',
      where: { userUuid, eventUuid, isDeleted: IsNull() }
    });
    if (!row) {
      throw new NotFoundException('Favorito no encontrado');
    }
    await this.dbRepository.update({
      entity: 'user_event_favorite',
      where: { uuid: row.uuid },
      data: { isDeleted: new Date(), updatedAt: new Date() }
    });
  }

  private resolveTimeframe(raw: string[] | undefined): TFavoriteTimeframe {
    const value = (raw?.[0] ?? 'all') as TFavoriteTimeframe;
    if (value !== 'upcoming' && value !== 'past' && value !== 'all') {
      throw new BadRequestException('timeframe debe ser upcoming, past o all');
    }
    return value;
  }

  private resolveOrder(
    order: TFavoriteOrder,
    timeframe: TFavoriteTimeframe
  ): Record<string, unknown> {
    if (order?.order_by === 'startDate' || order?.order_by === 'name') {
      const dir = order.order_direction === 'asc' ? 'ASC' : 'DESC';
      return { event: { [order.order_by]: dir } };
    }
    if (order?.order_by === 'createdAt') {
      return resolveListOrder(order, FAVORITE_ORDER_COLUMNS, { createdAt: 'DESC' });
    }
    if (timeframe === 'upcoming') {
      return { event: { startDate: 'ASC' } };
    }
    if (timeframe === 'past') {
      return { event: { startDate: 'DESC' } };
    }
    return { createdAt: 'DESC' };
  }

  private toItem(row: FavoriteWithEvent): TFavoriteItem {
    return {
      uuid: row.uuid,
      createdAt: row.createdAt,
      event: this.toEventCard(row.event)
    };
  }

  private toEventCard(event: FavoriteWithEvent['event']): TFavoriteEventCard {
    return {
      uuid: event.uuid,
      slug: event.slug,
      name: event.name,
      description: event.description,
      bannerUrl: event.bannerUrl,
      startDate: event.startDate,
      endDate: event.endDate,
      venueName: event.venueName,
      venueCity: event.venueCity,
      venueAddress: event.venueAddress,
      soldOut: false
    };
  }
}
