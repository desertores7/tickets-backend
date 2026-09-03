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
  /** No leidas del usuario, sin importar el filtro aplicado (para los contadores). */
  unreadTotal: number;
};

/** Filtro de lectura del listado. */
export const NOTIFICATION_STATUS = ['all', 'unread', 'read'] as const;
export type TNotificationStatus = (typeof NOTIFICATION_STATUS)[number];

export interface IUserNotificationService {
  listMine(
    userUuid: string,
    pagination: IPaginationParams,
    status?: TNotificationStatus
  ): Promise<TUserNotificationsPage>;
  markRead(userUuid: string, notificationUuid: string): Promise<TUserNotificationItem>;
  markAllRead(userUuid: string): Promise<number>;
  create(userUuid: string, title: string, body: string): Promise<TUserNotificationItem>;
}
