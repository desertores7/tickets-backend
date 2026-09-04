import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IsNull, Not } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DBRepository } from '@config/db/db.repository';
import { UserNotificationEntity } from '@config/db/entities/user/user_notification.entity';
import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import {
  IUserNotificationService,
  TNotificationStatus,
  TUserNotificationItem,
  TUserNotificationsPage
} from '../contracts/iuser-notification.service';

@Injectable()
export class UserNotificationService implements IUserNotificationService {
  constructor(@Inject(DBRepository) private readonly dbRepository: DBRepository) {}

  async listMine(
    userUuid: string,
    pagination: IPaginationParams,
    status: TNotificationStatus = 'all'
  ): Promise<TUserNotificationsPage> {
    const { page, limit } = pagination;
    const base = { userUuid, isDeleted: IsNull() };
    const where =
      status === 'unread'
        ? { ...base, readAt: IsNull() }
        : status === 'read'
          ? { ...base, readAt: Not(IsNull()) }
          : base;

    const { items, count } = await this.dbRepository.findManyAndCount({
      entity: 'user_notification',
      where,
      other: {
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit
      }
    });

    // El contador de no leidas no depende del filtro: alimenta el badge y las tabs.
    const unreadTotal =
      status === 'unread'
        ? count
        : (
            await this.dbRepository.findManyAndCount({
              entity: 'user_notification',
              where: { ...base, readAt: IsNull() },
              other: { take: 1 }
            })
          ).count;

    return {
      items: items.map(n => this.toItem(n)),
      total: count,
      page,
      limit,
      unreadTotal
    };
  }

  async markAllRead(userUuid: string): Promise<number> {
    const { items } = await this.dbRepository.findManyAndCount({
      entity: 'user_notification',
      where: { userUuid, isDeleted: IsNull(), readAt: IsNull() }
    });

    if (items.length === 0) return 0;

    const readAt = new Date();
    for (const item of items) {
      await this.dbRepository.update({
        entity: 'user_notification',
        where: { uuid: item.uuid },
        data: { readAt }
      });
    }

    return items.length;
  }

  async markRead(userUuid: string, notificationUuid: string): Promise<TUserNotificationItem> {
    const notification = await this.dbRepository.findOne({
      entity: 'user_notification',
      where: { uuid: notificationUuid, userUuid, isDeleted: IsNull() }
    });

    if (!notification) {
      throw new NotFoundException('Notificación no encontrada');
    }

    if (!notification.readAt) {
      const readAt = new Date();
      await this.dbRepository.update({
        entity: 'user_notification',
        where: { uuid: notificationUuid },
        data: { readAt }
      });
      notification.readAt = readAt;
    }

    return this.toItem(notification);
  }

  async create(userUuid: string, title: string, body: string): Promise<TUserNotificationItem> {
    const user = await this.dbRepository.findOne({
      entity: 'user',
      where: { uuid: userUuid, isDeleted: IsNull() }
    });
    if (!user) {
      throw new NotFoundException(`Usuario ${userUuid} no encontrado`);
    }

    const entity = new UserNotificationEntity();
    entity.uuid = uuidv4();
    entity.userUuid = userUuid;
    entity.title = title.trim();
    entity.body = body.trim();
    entity.readAt = null;
    entity.isDeleted = null;
    entity.createdAt = new Date();
    entity.updatedAt = new Date();

    await this.dbRepository.create({
      entity: 'user_notification',
      data: entity
    });

    return this.toItem(entity);
  }

  private toItem(n: {
    uuid: string;
    title: string;
    body: string;
    readAt: Date | null;
    createdAt: Date;
  }): TUserNotificationItem {
    return {
      uuid: n.uuid,
      title: n.title,
      body: n.body,
      readAt: n.readAt,
      createdAt: n.createdAt
    };
  }
}
