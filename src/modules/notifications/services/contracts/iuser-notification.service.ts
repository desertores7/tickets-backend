import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';

export type TUserNotificationItem = {
  uuid: string;
  title: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
};

export type TUserNotificationsPage = {
  items: TUserNotificationItem[];
  total: number;
  page: number;
  limit: number;
};

export interface IUserNotificationService {
  listMine(userUuid: string, pagination: IPaginationParams): Promise<TUserNotificationsPage>;
  markRead(userUuid: string, notificationUuid: string): Promise<TUserNotificationItem>;
  create(userUuid: string, title: string, body: string): Promise<TUserNotificationItem>;
}
