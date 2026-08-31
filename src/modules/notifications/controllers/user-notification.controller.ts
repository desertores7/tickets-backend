import { Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAuth } from '@root/shared/auth/decorator/user-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import {
  ApiPagination,
  IPaginationParams,
  PaginationParams
} from '@root/shared/decorators/pagination-query.decorator';
import { IUserNotificationService } from '../services/contracts/iuser-notification.service';
import {
  ListMyNotificationsResponse,
  UserNotificationResponse
} from './responses/user-notification.response';

@ApiTags('Notifications')
@Controller('notifications')
export class UserNotificationController {
  constructor(
    @Inject('IUserNotificationService')
    private readonly userNotificationService: IUserNotificationService
  ) {}

  @UserAuth(null, ListMyNotificationsResponse)
  @ApiOperation({
    summary: 'List my notifications',
    description: 'Paginated in-app notifications for the authenticated user (newest first).'
  })
  @ApiResponse({ status: 200, type: ListMyNotificationsResponse })
  @ApiPagination()
  @HttpCode(200)
  @Get('me')
  async listMine(
    @User() userId: string,
    @PaginationParams() pagination: IPaginationParams
  ): Promise<ListMyNotificationsResponse> {
    const page = await this.userNotificationService.listMine(userId, pagination);
    return new ListMyNotificationsResponse(page);
  }

  @UserAuth(null, UserNotificationResponse)
  @ApiOperation({
    summary: 'Mark notification as read',
    description: 'Sets readAt on a notification owned by the authenticated user.'
  })
  @ApiParam({ name: 'id', description: 'Notification UUID' })
  @ApiResponse({ status: 200, type: UserNotificationResponse })
  @HttpCode(200)
  @Patch('me/:id/read')
  async markRead(
    @User() userId: string,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<UserNotificationResponse> {
    const item = await this.userNotificationService.markRead(userId, id);
    return new UserNotificationResponse(item);
  }
}
