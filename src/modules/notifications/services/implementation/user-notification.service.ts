import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { DBRepository } from '@config/db/db.repository';
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
