import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { GetAllUserResponse } from './dtos/get-all-user/get-all-user.response';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { ApiPagination, IPaginationParams, PaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { ApiSearch, ISearchParams, SearchParams } from '@root/shared/decorators/search-query.decorator';
import { FilterParams, ApiFilter, IFiltersParams } from '@root/shared/decorators/filter-query.decorator';
import { USER_ORDER_COLUMNS, userFilters } from './const/user.filters';
import { ApiOrder, IOrderParams, OrderParams } from '@root/shared/decorators/order-query.decorator';
import { IUserService } from '../services/contracts/iuser.service';
import { CreateUserRequest } from './dtos/create-user/create-user.request';
import { UpdateUserRequest } from './dtos/update-user/update-user.request';
import { FileInterceptor } from '@nestjs/platform-express';
import { AssignRoleRequest } from './dtos/assign-role/assign-role.request';
import { GetListUserResponse } from './dtos/get-list-user/get-list-user.response';
import { GetIdUserResponse } from './dtos/get-id-user/get-id-user.response';
import { AdminAuth } from '@root/shared/auth/decorator/admin-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';

@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(@Inject('IUserService') public userService: IUserService) {}

  @ApiOperation({
    summary: 'Get all users',
    description: 'Returns all users from the local database with pagination, search and filters.'
  })
  @AdminAuth(null, GetAllUserResponse)
  @ApiPagination()
  @ApiSearch()
  @ApiFilter(userFilters)
  @ApiOrder(USER_ORDER_COLUMNS)
  @Get()
  async getUsers(
    @PaginationParams() pagination: IPaginationParams,
    @SearchParams() search: ISearchParams,
    @FilterParams(userFilters) filters: IFiltersParams<typeof userFilters>,
    @OrderParams() order: IOrderParams<typeof USER_ORDER_COLUMNS>
  ): Promise<{
    meta: PaginationMetaResponse;
    items: GetAllUserResponse[];
  }> {
    const result = await this.userService.getUsers(pagination, search, filters, order);
    return {
      meta: result.meta,
      items: result.items.map((item: any) => new GetAllUserResponse(item))
    };
  }

  @ApiOperation({
    summary: 'Get list of users',
    description: 'This endpoint is for get list of users'
  })
  @AdminAuth(null, GetListUserResponse)
  @ApiSearch()
  @Get('list')
  async getListUsers(@SearchParams() search: ISearchParams): Promise<GetListUserResponse[]> {
    const users = await this.userService.getListUsers(search);
    return users.map((user: any) => new GetListUserResponse(user));
  }

  @ApiOperation({
    summary: 'Get user by id',
    description: 'Returns a single user from the local user entity by UUID (not deleted).'
  })
  @AdminAuth(null, GetIdUserResponse)
  @ApiParam({ name: 'userId', description: 'UUID del usuario' })
  @Get(':userId')
  async getUserById(@Param('userId') userId: string): Promise<GetIdUserResponse> {
    const user = await this.userService.getUserId(userId);
    return new GetIdUserResponse(user);
  }

  @ApiOperation({
    summary: 'Create user',
    description: 'This endpoint is for create user'
  })
  // requestType en null: el body es multipart y lo describe @ApiConsumes,
  // igual que en el upload de banners de event.controller.
  @AdminAuth(null, null)
  @HttpCode(201)
  @Post()
  @UseInterceptors(FileInterceptor('imgProfile'))
  @ApiConsumes('multipart/form-data')
  async createUser(@Body() data: CreateUserRequest, @UploadedFile() file: Express.Multer.File): Promise<void> {
    const dataUser = {
      ...data,
      imgProfile: file
    };
    await this.userService.createUser(dataUser);
  }

  @ApiOperation({
    summary: 'Update user',
    description:
      'Partial update of a user. Optional: firstName, lastName, email, username, password, roleUuid, activeUser, imgProfile.'
  })
  @AdminAuth(null, null)
  @HttpCode(204)
  @Put(':userId')
  @UseInterceptors(FileInterceptor('imgProfile'))
  @ApiConsumes('multipart/form-data')
  async updateUser(
    @Param('userId') userId: string,
    @Body() data: UpdateUserRequest,
    @UploadedFile() file?: Express.Multer.File
  ): Promise<void> {
    await this.userService.updateUser(userId, data);
  }

  @ApiOperation({
    summary: 'Delete user (logical)',
    description: 'Soft-deletes the user by setting isDeleted.'
  })
  @AdminAuth(null, null)
  @HttpCode(204)
  @Delete(':userId')
  async deleteUser(@Param('userId') userId: string): Promise<void> {
    await this.userService.deleteUser([userId]);
  }

  @ApiOperation({
    summary: 'Assign role to user',
    description: 'This endpoint assigns a role to an existing user'
  })
  @AdminAuth(AssignRoleRequest, null)
  @HttpCode(201)
  @Post(':userId/roles')
  async assignRoleToUser(
    @Param('userId') userId: string,
    @Body() data: AssignRoleRequest,
    @User() adminId: string
  ): Promise<void> {
    // assignedBy es el administrador que ejecuta la acción, no el usuario que
    // recibe el rol (antes se pasaba userId y el registro de auditoría mentía).
    await this.userService.assignRoleToUser(userId, data.roleUuid, adminId);
  }

}
