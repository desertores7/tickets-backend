import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminAuth } from '@root/shared/auth/decorator/admin-auth.decorator';
import { UserAuth } from '@root/shared/auth/decorator/user-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import {
  ApiPagination,
  IPaginationParams,
  PaginationParams
} from '@root/shared/decorators/pagination-query.decorator';
import {
  IUserNotificationService,
  NOTIFICATION_STATUS,
  TNotificationStatus
} from '../services/contracts/iuser-notification.service';
import { CreateNotificationRequest } from './dtos/create-notification/create-notification.request';
import {
  ListMyNotificationsResponse,
  UserNotificationResponse
} from './responses/user-notification.response';

@Controller('notifications')
export class UserNotificationController {
  constructor(
    @Inject('IUserNotificationService')
    private readonly userNotificationService: IUserNotificationService
  ) {}

  @ApiTags('Notificaciones')
  @UserAuth(null, ListMyNotificationsResponse)
  @ApiOperation({
    summary: 'Listar mis notificaciones',
    description: 'Paginated in-app notifications for the authenticated user (newest first).'
  })
  @ApiResponse({ status: 200, type: ListMyNotificationsResponse })
  @ApiPagination()
  @ApiQuery({
    name: 'status',
    required: false,
    enum: NOTIFICATION_STATUS,
    description: 'Filtro de lectura. Por defecto "all".'
  })
  @HttpCode(200)
  @Get('me')
  async listMine(
    @User() userId: string,
    @PaginationParams() pagination: IPaginationParams,
    @Query('status') status?: string
  ): Promise<ListMyNotificationsResponse> {
    const parsed = (status ?? 'all') as TNotificationStatus;
    if (!NOTIFICATION_STATUS.includes(parsed)) {
      throw new BadRequestException(`status debe ser uno de: ${NOTIFICATION_STATUS.join(', ')}`);
    }

    const page = await this.userNotificationService.listMine(userId, pagination, parsed);
    return new ListMyNotificationsResponse(page);
  }

  @ApiTags('Notificaciones')
  @UserAuth(null, null)
  @ApiOperation({
    summary: 'Marcar todas como leídas',
    description: 'Sets readAt on every unread notification of the authenticated user.'
  })
  @ApiResponse({ status: 200, description: 'Cantidad de notificaciones marcadas' })
  @HttpCode(200)
  @Patch('me/read-all')
  async markAllRead(@User() userId: string): Promise<{ updated: number }> {
    const updated = await this.userNotificationService.markAllRead(userId);
    return { updated };
  }

  @ApiTags('Notificaciones')
  @UserAuth(null, UserNotificationResponse)
  @ApiOperation({
    summary: 'Marcar notificación como leída',
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

  @ApiTags('Admin — Notificaciones')
  @AdminAuth(CreateNotificationRequest, UserNotificationResponse)
  @ApiOperation({
    summary: 'Crear notificación',
    description:
      'Crea una notificación in-app para el usuario indicado. Útil para probar sonido, badge y globo del SO en el front (poll ~30s). Solo Administrador.'
  })
  @ApiResponse({ status: 201, type: UserNotificationResponse })
  @HttpCode(201)
  @Post()
  async create(@Body() body: CreateNotificationRequest): Promise<UserNotificationResponse> {
    const item = await this.userNotificationService.create(body.userUuid, body.title, body.body);
    return new UserNotificationResponse(item);
  }
}
