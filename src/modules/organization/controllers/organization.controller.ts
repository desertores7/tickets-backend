import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminAuth } from '@root/shared/auth/decorator/admin-auth.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { ApiPagination, IPaginationParams, PaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { ApiSearch, ISearchParams, SearchParams } from '@root/shared/decorators/search-query.decorator';
import { ApiFilter, FilterParams, IFiltersParams } from '@root/shared/decorators/filter-query.decorator';
import { UserAuth } from '@root/shared/auth/decorator/user-auth.decorator';
import { IOrganizationService } from '../services/contracts/iorganization.service';
import { GetAllOrganizationResponse } from './dtos/get-all-organization/get-all-organization.response';
import { CreateOrganizationRequest } from './dtos/create-organization/create-organization.request';
import { GetIdOrganizationResponse } from './dtos/get-id-organization/get-id-organization.response';
import { UpdateOrganizationRequest } from './dtos/update-organization/update-organization.request';
import { AssignUserOrganizationRequest } from './dtos/assign-user-organization/assign-user-organization.request';
import { UnassignUserOrganizationRequest } from './dtos/unassing-user-organization/unassign-user-organization.request';
import { LinkUsersOrganizationRequest } from './dtos/link-users-organization/link-users-organization.request';
import { User } from '@root/shared/auth/decorator/user.decorator';
import {
  OrganizationUsersListResponse,
  UserOrganizationResponse
} from './dtos/get-id-organization/get-id-organization.response';
import { OrganizationMeResponse } from './dtos/organization-me/organization-me.response';
import { UpdateOrganizationMeRequest } from './dtos/organization-me/update-organization-me.request';
import { RejectOrganizationRequest } from './dtos/organization-me/reject-organization.request';
import { organizationFilters } from './const/organization.filters';

@ApiTags('Organizations')
@Controller({ path: 'organizations', version: '1' })
export class OrganizationController {
  constructor(@Inject('IOrganizationService') public _organizationService: IOrganizationService) {}

  @UserAuth(null, OrganizationMeResponse)
  @ApiOperation({
    summary: 'Get my organization (producer)',
    description: 'Returns the organization linked to the authenticated producer, including fiscal validation fields.'
  })
  @Get('me')
  async getMyOrganization(@User() userId: string): Promise<OrganizationMeResponse> {
    const org = await this._organizationService.getMyOrganization(userId);
    return new OrganizationMeResponse(org);
  }

  @UserAuth(UpdateOrganizationMeRequest, OrganizationMeResponse)
  @ApiOperation({
    summary: 'Update my organization fiscal data',
    description: 'Partial update of fiscal wizard fields. Blocked while pending_review.'
  })
  @Patch('me')
  async updateMyOrganization(
    @User() userId: string,
    @Body() body: UpdateOrganizationMeRequest
  ): Promise<OrganizationMeResponse> {
    const org = await this._organizationService.updateMyOrganization(userId, body);
    return new OrganizationMeResponse(org);
  }

  @UserAuth(null, OrganizationMeResponse)
  @ApiOperation({
    summary: 'Submit organization for fiscal validation',
    description: 'Requires all fiscal fields. Sets validationStatus to pending_review.'
  })
  @HttpCode(200)
  @Post('me/submit-validation')
  async submitMyOrganizationValidation(@User() userId: string): Promise<OrganizationMeResponse> {
    const org = await this._organizationService.submitMyOrganizationValidation(userId);
    return new OrganizationMeResponse(org);
  }

  @AdminAuth(null, OrganizationMeResponse)
  @ApiOperation({ summary: 'Approve organization fiscal validation' })
  @HttpCode(200)
  @Post(':organizationUuid/approve')
  async approveOrganization(
    @Param('organizationUuid') organizationUuid: string,
    @User() adminId: string
  ): Promise<OrganizationMeResponse> {
    const org = await this._organizationService.approveOrganization(organizationUuid, adminId);
    return new OrganizationMeResponse(org);
  }

  @AdminAuth(RejectOrganizationRequest, OrganizationMeResponse)
  @ApiOperation({ summary: 'Reject organization fiscal validation' })
  @HttpCode(200)
  @Post(':organizationUuid/reject')
  async rejectOrganization(
    @Param('organizationUuid') organizationUuid: string,
    @User() adminId: string,
    @Body() body: RejectOrganizationRequest
  ): Promise<OrganizationMeResponse> {
    const org = await this._organizationService.rejectOrganization(organizationUuid, adminId, body.reason);
    return new OrganizationMeResponse(org);
  }

  @UserAuth(null, GetAllOrganizationResponse)
  @ApiOperation({
    summary: 'Get all organizations',
    description:
      'Lists organizations. Admins see all; other users only their memberships. Supports search, pagination and validationStatus filter.'
  })
  @ApiPagination()
  @ApiSearch()
  @ApiFilter(organizationFilters)
  @Get()
  async getOrganizations(
    @PaginationParams() pagination: IPaginationParams,
    @SearchParams() search: ISearchParams,
    @FilterParams(organizationFilters) filters: IFiltersParams<typeof organizationFilters>,
    @User() loggedUser: string
  ): Promise<{
    meta: PaginationMetaResponse;
    items: GetAllOrganizationResponse[];
  }> {
    const organization = await this._organizationService.getOrganizations(
      pagination,
      search,
      loggedUser,
      filters
    );
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

  @AdminAuth(LinkUsersOrganizationRequest, null)
  @ApiOperation({
    summary: 'Link existing users to organization',
    description:
      'Assigns users that ALREADY exist to the organization (unlike POST /assign-user, which creates a new user). ' +
      'Used by the admin backoffice to grant a `Productor` access to an organization. ' +
      'Idempotent: re-linking someone already assigned is a no-op.'
  })
  @ApiResponse({ status: 200, description: 'Users linked to the organization.' })
  @ApiResponse({ status: 400, description: 'Organization or user not found.' })
  @ApiResponse({ status: 401, description: 'JWT token missing, invalid or expired.' })
  @ApiResponse({ status: 403, description: 'Requires the Administrador role.' })
  @HttpCode(200)
  @Post(':organizationUuid/members')
  async linkUsersToOrganization(
    @Param('organizationUuid') organizationUuid: string,
    @Body() data: LinkUsersOrganizationRequest
  ): Promise<boolean> {
    return await this._organizationService.linkUsersToOrganization(organizationUuid, data.userUuids);
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
