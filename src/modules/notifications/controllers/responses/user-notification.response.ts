import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { TUserNotificationItem, TUserNotificationsPage } from '../../services/contracts/iuser-notification.service';

export class UserNotificationResponse {
  @ApiProperty()
  uuid: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  body: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  constructor(data: TUserNotificationItem) {
    this.uuid = data.uuid;
    this.title = data.title;
    this.body = data.body;
    this.readAt = data.readAt;
    this.createdAt = data.createdAt;
  }
}

export class ListMyNotificationsResponse {
  @ApiProperty({ type: [UserNotificationResponse] })
  items: UserNotificationResponse[];

  @ApiProperty({ type: PaginationMetaResponse })
  meta: PaginationMetaResponse;

  constructor(page: TUserNotificationsPage) {
    this.items = page.items.map(i => new UserNotificationResponse(i));
    this.meta = new PaginationMetaResponse({
      total: page.total,
      page: page.page,
      limit: page.limit
    });
  }
}
