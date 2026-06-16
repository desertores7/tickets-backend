import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { ApiPagination, IPaginationParams, PaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { ApiSearch, ISearchParams, SearchParams } from '@root/shared/decorators/search-query.decorator';
import { UserAuth } from '@root/shared/auth/decorator/user-auth.decorator';
import { IOrganizationService } from '../services/contracts/iorganization.service';
import { GetAllOrganizationResponse } from './dtos/get-all-organization/get-all-organization.response';
import { CreateOrganizationRequest } from './dtos/create-organization/create-organization.request';
import { GetIdOrganizationResponse } from './dtos/get-id-organization/get-id-organization.response';
import { UpdateOrganizationRequest } from './dtos/update-organization/update-organization.request';
import { AssignUserOrganizationRequest } from './dtos/assign-user-organization/assign-user-organization.request';
import { UnassignUserOrganizationRequest } from './dtos/unassing-user-organization/unassign-user-organization.request';
import { User } from '@root/shared/auth/decorator/user.decorator';
import {
  OrganizationUsersListResponse,
  UserOrganizationResponse
} from './dtos/get-id-organization/get-id-organization.response';

@ApiTags('Organizations')
@Controller({ path: 'organizations', version: '1' })
export class OrganizationController {
  constructor(@Inject('IOrganizationService') public _organizationService: IOrganizationService) {}

  @UserAuth(null, GetAllOrganizationResponse)
  @ApiOperation({
    summary: 'Get all organizations',
    description: 'This endpoint is for get all organizations'
  })
  @ApiPagination()
  @ApiSearch()
  @Get()
  async getOrganizations(
    @PaginationParams() pagination: IPaginationParams,
    @SearchParams() search: ISearchParams,
    @User() loggedUser: string
  ): Promise<{
    meta: PaginationMetaResponse;
    items: GetAllOrganizationResponse[];
  }> {
    const organization = await this._organizationService.getOrganizations(pagination, search, loggedUser);
    return {
      meta: organization.meta,
      items: organization.items.map(item => new GetAllOrganizationResponse(item))
    };
  }

  @UserAuth(null, OrganizationUsersListResponse)
  @ApiOperation({
    summary: 'Get organization users',
    description: 'Returns all users that belong to the organizations of the authenticated user'
  })
  @ApiPagination()
  @HttpCode(200)
  @Get('users')
  async getOrganizationUsers(
    @User() loggedUser: string,
    @PaginationParams() pagination: IPaginationParams
  ): Promise<{
    meta: PaginationMetaResponse;
    items: UserOrganizationResponse[];
  }> {
    const result = await this._organizationService.getOrganizationUsers(loggedUser, pagination);
    return {
      meta: result.meta,
      items: result.items.map(user => new UserOrganizationResponse(user))
    };
  }

  @UserAuth(CreateOrganizationRequest, null)
  @ApiOperation({
    summary: 'Create organization',
    description: 'This endpoint is for create organization'
  })
  @HttpCode(201)
  @Post()
  async createOrganization(@Body() data: CreateOrganizationRequest): Promise<boolean> {
    return await this._organizationService.createOrganization(data);
  }

  @UserAuth(null, GetIdOrganizationResponse)
  @ApiOperation({
    summary: 'Get organization by id',
    description: 'This endpoint is for get organization by id'
  })
  @HttpCode(200)
  @ApiSearch()
  @Get(':organizationUuid')
  async getOrganizationById(
    @Param('organizationUuid') organizationUuid: string,
    @SearchParams() search: ISearchParams
  ): Promise<GetIdOrganizationResponse> {
    const organization = await this._organizationService.getOrganizationId(organizationUuid, search);
    return new GetIdOrganizationResponse(organization);
  }

  @UserAuth(UpdateOrganizationRequest, null)
  @ApiOperation({
    summary: 'Update organization',
    description: 'This endpoint is for update user'
  })
  @HttpCode(200)
  @Put(':organizationUuid')
  async updateOrganization(
    @Param('organizationUuid') organizationUuid: string,
    @Body() data: UpdateOrganizationRequest
  ): Promise<void> {
    await this._organizationService.updateOrganization(organizationUuid, data);
  }

  @UserAuth(AssignUserOrganizationRequest, null)
  @ApiOperation({
    summary: 'Assign user to organization',
    description: 'Creates a new user (same fields as POST /auth/register/client) and assigns them to the organization'
  })
  @HttpCode(201)
  @Post(':organizationUuid/assign-user')
  async assignUserOrganization(
    @Param('organizationUuid') organizationUuid: string,
    @Body() data: AssignUserOrganizationRequest
  ): Promise<boolean> {
    return await this._organizationService.assignUserOrganization(organizationUuid, data);
  }

  @UserAuth(UnassignUserOrganizationRequest, null)
  @ApiOperation({
    summary: 'Unassign user to organization',
    description: 'This endpoint is for unassign user to organization'
  })
  @HttpCode(201)
  @Delete(':organizationUuid/unassign-user')
  async unassignUserOrganization(
    @Param('organizationUuid') organizationUuid: string,
    @Body() data: UnassignUserOrganizationRequest
  ): Promise<boolean> {
    return await this._organizationService.unassignUserOrganization(organizationUuid, data);
  }

  @UserAuth(null, null)
  @ApiOperation({
    summary: 'Delete organization',
    description: 'This endpoint is for delete organization'
  })
  @HttpCode(200)
  @Delete(':organizationUuid')
  async deleteOrganization(@Param('organizationUuid') organizationUuid: string): Promise<boolean> {
    return await this._organizationService.deleteOrganization(organizationUuid);
  }
}
