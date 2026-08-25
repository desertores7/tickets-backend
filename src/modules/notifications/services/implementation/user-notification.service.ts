import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DBRepository } from '@config/db/db.repository';
import { UserNotificationEntity } from '@config/db/entities/user/user_notification.entity';
import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import {
  IUserNotificationService,
  TUserNotificationItem,
  TUserNotificationsPage
} from '../contracts/iuser-notification.service';

@Injectable()
export class UserNotificationService implements IUserNotificationService {
  constructor(@Inject(DBRepository) private readonly dbRepository: DBRepository) {}

  async listMine(userUuid: string, pagination: IPaginationParams): Promise<TUserNotificationsPage> {
    const { page, limit } = pagination;
    const { items, count } = await this.dbRepository.findManyAndCount({
      entity: 'user_notification',
      where: { userUuid, isDeleted: IsNull() },
      other: {
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit
      }
    });

    return {
      items: items.map(n => this.toItem(n)),
      total: count,
      page,
      limit
    };
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
