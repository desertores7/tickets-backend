import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { ApiPagination, IPaginationParams, PaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { ApiSearch, ISearchParams, SearchParams } from '@root/shared/decorators/search-query.decorator';
import { IRoleService } from '../services/contracts/irole.service';
import { GetIdRoleResponse } from './dtos/get-id-role/get-id-role.response';
import { UpdateRoleRequest } from './dtos/update-role/update-role.request';
import { GetAllRoleResponse } from './dtos/get-all-role/get-all-role.response';
import { CreateRoleRequest } from './dtos/create-role/create-role.request';
import { User } from '@root/shared/auth/decorator/user.decorator';
import { AdminAuth } from '@root/shared/auth/decorator/admin-auth.decorator';

@ApiTags('Roles')
@Controller({ path: 'roles', version: '1' })
export class RoleController {
  constructor(@Inject('IRoleService') public _roleService: IRoleService) {}

  @AdminAuth(null, GetAllRoleResponse)
  @ApiOperation({
    summary: 'Get all roles',
    description: 'This endpoint is for get all roles'
  })
  @ApiPagination()
  @ApiSearch()
  @Get()
  async getRoles(
    @PaginationParams() pagination: IPaginationParams,
    @SearchParams() search: ISearchParams
  ): Promise<{
    meta: PaginationMetaResponse;
    items: GetAllRoleResponse[];
  }> {
    const role = await this._roleService.getRoles(pagination, search);
    return {
      meta: role.meta,
      items: role.items.map(item => new GetAllRoleResponse(item))
    };
  }

  @AdminAuth(CreateRoleRequest, null)
  @ApiOperation({
    summary: 'Create role',
    description: 'This endpoint is for create role'
  })
  @HttpCode(201)
  @Post()
  async createRole(@Body() data: CreateRoleRequest, @User() userId: string): Promise<void> {
    await this._roleService.createRole(data, userId);
  }

  @AdminAuth(null, GetIdRoleResponse)
  @ApiOperation({
    summary: 'Get role by id',
    description: 'This endpoint is for get role by id'
  })
  @HttpCode(200)
  @Get(':roleUuid')
  async getRoleById(@Param('roleUuid') roleUuid: string): Promise<GetIdRoleResponse> {
    const user = await this._roleService.getRoleId(roleUuid);
    return new GetIdRoleResponse(user);
  }

  @AdminAuth(UpdateRoleRequest, null)
  @ApiOperation({
    summary: 'Update role',
    description: 'This endpoint is for update user'
  })
  @HttpCode(200)
  @Put(':roleUuid')
  async updateRole(
    @Param('roleUuid') roleUuid: string,
    @Body() data: UpdateRoleRequest,
    @User() userId: string
  ): Promise<void> {
    await this._roleService.updateRole(roleUuid, data, userId);
  }

  @AdminAuth(null, null)
  @ApiOperation({
    summary: 'Delete role',
    description: 'This endpoint is for delete role'
  })
  @HttpCode(200)
  @Delete(':roleUuid')
  async deleteRole(@Param('roleUuid') roleUuid: string): Promise<boolean> {
    return await this._roleService.deleteRole(roleUuid);
  }
}
