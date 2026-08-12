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
import { userFilters } from './const/user.filters';
import { IUserService } from '../services/contracts/iuser.service';
import { CreateUserRequest } from './dtos/create-user/create-user.request';
import { UpdateUserRequest } from './dtos/update-user/update-user.request';
import { FileInterceptor } from '@nestjs/platform-express';
import { AssignRoleRequest } from './dtos/assign-role/assign-role.request';
import { GetListUserResponse } from './dtos/get-list-user/get-list-user.response';
import { GetIdUserResponse } from './dtos/get-id-user/get-id-user.response';

@ApiTags('Users')
@Controller({ path: 'users', version: '1' })
export class UserController {
  constructor(@Inject('IUserService') public userService: IUserService) {}

  @ApiOperation({
    summary: 'Get all users',
    description: 'Returns all users from the local database with pagination, search and filters.'
  })
  @ApiPagination()
  @ApiSearch()
  @ApiFilter(userFilters)
  @Get()
  async getUsers(
    @PaginationParams() pagination: IPaginationParams,
    @SearchParams() search: ISearchParams,
    @FilterParams(userFilters) filters: IFiltersParams<typeof userFilters>
  ): Promise<{
    meta: PaginationMetaResponse;
    items: GetAllUserResponse[];
  }> {
    const result = await this.userService.getUsers(pagination, search, filters);
    return {
      meta: result.meta,
      items: result.items.map((item: any) => new GetAllUserResponse(item))
    };
  }

  @ApiOperation({
    summary: 'Get list of users',
    description: 'This endpoint is for get list of users'
  })
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
  @HttpCode(204)
  @Delete(':userId')
  async deleteUser(@Param('userId') userId: string): Promise<void> {
    await this.userService.deleteUser([userId]);
  }

  @ApiOperation({
    summary: 'Assign role to user',
    description: 'This endpoint assigns a role to an existing user'
  })
  @HttpCode(201)
  @Post(':userId/roles')
  async assignRoleToUser(@Param('userId') userId: string, @Body() data: AssignRoleRequest): Promise<void> {
    // TODO: Obtener el UUID del usuario que está haciendo la asignación desde el token/auth
    // Por ahora usamos el mismo userId como assignedBy
    await this.userService.assignRoleToUser(userId, data.roleUuid, userId);
  }

}
