import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseFilePipeBuilder,
  Patch,
  Post,
  Put,
  Res,
  StreamableFile,
  UploadedFile,
  UploadedFiles,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { createReadStream } from 'fs';
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
import { RequestBankChangeRequest } from './dtos/organization-me/request-bank-change.request';
import { RequestFiscalChangeRequest } from './dtos/organization-me/request-fiscal-change.request';
import { RejectOrganizationRequest } from './dtos/organization-me/reject-organization.request';
import { FiscalDocumentResponse } from './dtos/organization-me/fiscal-document.response';
import { ORGANIZATION_ORDER_COLUMNS, organizationFilters } from './const/organization.filters';
import { staffFilters } from './const/staff.filters';
import { ApiOrder, IOrderParams, OrderParams } from '@root/shared/decorators/order-query.decorator';
import { OrganizationStaffService } from '../services/implementation/organization-staff.service';
import { CreateStaffRequest } from './dtos/organization-staff/create-staff.request';
import { InviteProducerStaffRequest } from './dtos/organization-staff/invite-producer-staff.request';
import { UpdateStaffRequest } from './dtos/organization-staff/update-staff.request';
import { StaffListResponse, StaffMemberResponse } from './dtos/organization-staff/staff-member.response';
import {
  ORGANIZATION_FISCAL_DOC_MAX_BYTES,
  ORGANIZATION_FISCAL_DOC_MAX_FILES
} from '@modules/organization/const/organization-fiscal.const';

// Sin @ApiTags a nivel de clase: este controller cubre lo que la productora
// hace sobre si misma, su staff, y lo que el Administrador hace sobre
// cualquier productora. Las rutas no cambian.
@Controller('organizations')
export class OrganizationController {
  constructor(
    @Inject('IOrganizationService') public _organizationService: IOrganizationService,
    private readonly organizationStaffService: OrganizationStaffService
  ) {}

  private async toMeResponse(org: Awaited<ReturnType<IOrganizationService['getMyOrganization']>>) {
    const requests = await this._organizationService.getOrgRequestView(org.uuid);
    return new OrganizationMeResponse(org, requests);
  }

  @UserAuth(null, OrganizationMeResponse)
  @ApiOperation({
    summary: 'Obtener mi productora',
    description: 'Returns the organization linked to the authenticated producer, including fiscal validation fields.'
  })
  @ApiTags('Productora — Organización')
  @Get('me')
  async getMyOrganization(@User() userId: string): Promise<OrganizationMeResponse> {
    const org = await this._organizationService.getMyOrganization(userId);
    return this.toMeResponse(org);
  }

  @UserAuth(UpdateOrganizationMeRequest, OrganizationMeResponse)
  @ApiOperation({
    summary: 'Actualizar datos fiscales',
    description: 'Partial update of fiscal wizard fields. Blocked while pending_review.'
  })
  @ApiTags('Productora — Organización')
  @Patch('me')
  async updateMyOrganization(
    @User() userId: string,
    @Body() body: UpdateOrganizationMeRequest
  ): Promise<OrganizationMeResponse> {
    const org = await this._organizationService.updateMyOrganization(userId, body);
    return this.toMeResponse(org);
  }

  @UserAuth(null, OrganizationMeResponse)
  @ApiOperation({
    summary: 'Enviar a validación fiscal',
    description: 'Requires all fiscal + bank fields and minimum document pack. Sets pending_review.'
  })
  @HttpCode(200)
  @ApiTags('Productora — Organización')
  @Post('me/submit-validation')
  async submitMyOrganizationValidation(@User() userId: string): Promise<OrganizationMeResponse> {
    const org = await this._organizationService.submitMyOrganizationValidation(userId);
    return this.toMeResponse(org);
  }

  @UserAuth(RequestBankChangeRequest, OrganizationMeResponse)
  @ApiOperation({
    summary: 'Solicitar cambio de cuenta bancaria',
    description:
      'Queues banco/CBU/alias for admin review. Does not change validationStatus; producer stays operational.'
  })
  @HttpCode(200)
  @ApiTags('Productora — Organización')
  @Post('me/bank-change-request')
  async requestBankAccountChange(
    @User() userId: string,
    @Body() body: RequestBankChangeRequest
  ): Promise<OrganizationMeResponse> {
    const org = await this._organizationService.requestBankAccountChange(userId, body);
    return this.toMeResponse(org);
  }

  @UserAuth(RequestFiscalChangeRequest, OrganizationMeResponse, 'multipart/form-data')
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({
    summary: 'Solicitar cambio de identidad fiscal',
    description:
      'Queues identity fields for admin review and optionally applies document add/delete. Does not change validationStatus; producer stays operational.'
  })
  @UseInterceptors(FilesInterceptor('files', ORGANIZATION_FISCAL_DOC_MAX_FILES))
  @HttpCode(200)
  @ApiTags('Productora — Organización')
  @Post('me/fiscal-change-request')
  async requestFiscalIdentityChange(
    @User() userId: string,
    @Body() body: RequestFiscalChangeRequest,
    @UploadedFiles() files?: Express.Multer.File[]
  ): Promise<OrganizationMeResponse> {
    const org = await this._organizationService.requestFiscalIdentityChange(
      userId,
      body,
      files ?? []
    );
    return this.toMeResponse(org);
  }

  @UserAuth(null, StaffListResponse)
  @ApiOperation({
    summary: 'Listar staff',
    description:
      'Productores, Validadores, Caja e invitaciones pendientes de la productora aprobada.\n\n' +
      '- `search`: nombre o email.\n' +
      '- `role`: producer | validator | cashier.\n' +
      '- `status`: pending | active | inactive.\n' +
      '- `page` / `limit`: paginación de `items`.\n' +
      '`byRole` y `total` reflejan siempre el equipo completo.'
  })
  @ApiPagination()
  @ApiSearch()
  @ApiFilter(staffFilters)
  @ApiTags('Productora — Staff')
  @Get('me/staff')
  async listMyStaff(
    @User() userId: string,
    @PaginationParams() pagination: IPaginationParams,
    @SearchParams() search: ISearchParams,
    @FilterParams(staffFilters) filters: IFiltersParams<typeof staffFilters>
  ): Promise<StaffListResponse> {
    const result = await this.organizationStaffService.listStaff(userId, {
      search: search.search,
      role: filters.role?.[0],
      status: filters.status?.[0],
      pagination
    });
    return new StaffListResponse(
      result.items,
      result.byRole,
      result.total,
      new PaginationMetaResponse(result.meta)
    );
  }

  @UserAuth(CreateStaffRequest, StaffMemberResponse)
  @ApiOperation({
    summary: 'Crear staff — validador o caja',
    description: 'Producer defines email and password. Caja requires at least one assigned event.'
  })
  @HttpCode(201)
  @ApiTags('Productora — Staff')
  @Post('me/staff')
  async createStaff(
    @User() userId: string,
    @Body() body: CreateStaffRequest
  ): Promise<StaffMemberResponse> {
    return this.organizationStaffService.createStaff(userId, body);
  }

  @UserAuth(InviteProducerStaffRequest, StaffMemberResponse)
  @ApiOperation({
    summary: 'Invitar productor',
    description: 'Sends email with link to set password and join the organization.'
  })
  @HttpCode(201)
  @ApiTags('Productora — Staff')
  @Post('me/staff/invite')
  async inviteProducerStaff(
    @User() userId: string,
    @Body() body: InviteProducerStaffRequest
  ): Promise<StaffMemberResponse> {
    return this.organizationStaffService.inviteProducer(userId, body.email);
  }

  @UserAuth(UpdateStaffRequest, StaffMemberResponse)
  @ApiOperation({
    summary: 'Actualizar staff',
    description: 'Toggle active status and/or update Caja event assignments.'
  })
  @ApiTags('Productora — Staff')
  @Patch('me/staff/:userUuid')
  async updateStaff(
    @User() userId: string,
    @Param('userUuid') targetUserUuid: string,
    @Body() body: UpdateStaffRequest
  ): Promise<StaffMemberResponse> {
    return this.organizationStaffService.updateStaff(userId, targetUserUuid, body);
  }

  @UserAuth(null, null)
  @ApiOperation({
    summary: 'Cancelar invitación pendiente',
    description:
      'Invalidates the invitation so the email link no longer works. The invite disappears from the staff list.',
  })
  @HttpCode(204)
  @ApiTags('Productora — Staff')
  @Delete('me/staff/invites/:inviteUuid')
  async cancelProducerInvite(
    @User() userId: string,
    @Param('inviteUuid') inviteUuid: string,
  ): Promise<void> {
    await this.organizationStaffService.cancelInvite(userId, inviteUuid);
  }

  @UserAuth(null, null)
  @ApiOperation({
    summary: 'Quitar staff de la productora',
    description: 'Soft-deletes org membership. Does not delete the user account globally.'
  })
  @HttpCode(204)
  @ApiTags('Productora — Staff')
  @Delete('me/staff/:userUuid')
  async removeStaff(@User() userId: string, @Param('userUuid') targetUserUuid: string): Promise<void> {
    await this.organizationStaffService.removeStaff(userId, targetUserUuid);
  }

  @UserAuth(null, FiscalDocumentResponse, 'multipart/form-data')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Subir documento fiscal',
    description:
      'Multipart field `file`. documentKind is optional (auto-assigned to fill pack mínimo). Max 10 files, 5MB, PDF/JPG/PNG/WebP. Blocked while pending_review.'
  })
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(201)
  @ApiTags('Productora — Organización')
  @Post('me/fiscal-documents')
  async uploadMyFiscalDocument(
    @User() userId: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: ORGANIZATION_FISCAL_DOC_MAX_BYTES })
        .build({ fileIsRequired: true })
    )
    file: Express.Multer.File,
    @Body('documentKind') documentKind?: string
  ): Promise<FiscalDocumentResponse> {
    const doc = await this._organizationService.uploadMyFiscalDocument(userId, file, documentKind);
    return new FiscalDocumentResponse(doc);
  }

  @UserAuth(null, FiscalDocumentResponse)
  @ApiOperation({ summary: 'Listar mis documentos fiscales' })
  @ApiTags('Productora — Organización')
  @Get('me/fiscal-documents')
  async listMyFiscalDocuments(@User() userId: string): Promise<FiscalDocumentResponse[]> {
    const docs = await this._organizationService.listMyFiscalDocuments(userId);
    return docs.map(d => new FiscalDocumentResponse(d));
  }

  @UserAuth(null, null)
  @ApiOperation({ summary: 'Descargar mi documento fiscal' })
  @ApiTags('Productora — Organización')
  @Get('me/fiscal-documents/:documentId/download')
  async downloadMyFiscalDocument(
    @User() userId: string,
    @Param('documentId') documentId: string,
    @Res({ passthrough: true }) res: Response
  ): Promise<StreamableFile> {
    const file = await this._organizationService.getMyFiscalDocumentDownload(userId, documentId);
    this.applyFiscalDownloadHeaders(res, file.mimeType, file.originalName);
    return new StreamableFile(createReadStream(file.absolutePath));
  }

  @UserAuth(null, null)
  @ApiOperation({ summary: 'Eliminar mi documento fiscal' })
  @HttpCode(200)
  @ApiTags('Productora — Organización')
  @Delete('me/fiscal-documents/:documentId')
  async deleteMyFiscalDocument(
    @User() userId: string,
    @Param('documentId') documentId: string
  ): Promise<{ ok: true }> {
    await this._organizationService.deleteMyFiscalDocument(userId, documentId);
    return { ok: true };
  }

  @AdminAuth(null, FiscalDocumentResponse)
  @ApiOperation({ summary: 'Listar documentos fiscales de una productora' })
  @ApiTags('Admin — Organizaciones')
  @Get(':organizationUuid/fiscal-documents')
  async listOrganizationFiscalDocuments(
    @Param('organizationUuid') organizationUuid: string
  ): Promise<FiscalDocumentResponse[]> {
    const docs = await this._organizationService.listOrganizationFiscalDocuments(organizationUuid);
    return docs.map(d => new FiscalDocumentResponse(d));
  }

  @AdminAuth(null, null)
  @ApiOperation({ summary: 'Descargar documento fiscal de una productora' })
  @ApiTags('Admin — Organizaciones')
  @Get(':organizationUuid/fiscal-documents/:documentId/download')
  async downloadOrganizationFiscalDocument(
    @Param('organizationUuid') organizationUuid: string,
    @Param('documentId') documentId: string,
    @Res({ passthrough: true }) res: Response
  ): Promise<StreamableFile> {
    const file = await this._organizationService.getOrganizationFiscalDocumentDownload(
      organizationUuid,
      documentId
    );
    this.applyFiscalDownloadHeaders(res, file.mimeType, file.originalName);
    return new StreamableFile(createReadStream(file.absolutePath));
  }

  @AdminAuth(null, OrganizationMeResponse)
  @ApiOperation({ summary: 'Aprobar validación fiscal' })
  @HttpCode(200)
  @ApiTags('Admin — Organizaciones')
  @Post(':organizationUuid/approve')
  async approveOrganization(
    @Param('organizationUuid') organizationUuid: string,
    @User() adminId: string
  ): Promise<OrganizationMeResponse> {
    const org = await this._organizationService.approveOrganization(organizationUuid, adminId);
    return this.toMeResponse(org);
  }

  @AdminAuth(RejectOrganizationRequest, OrganizationMeResponse)
  @ApiOperation({ summary: 'Rechazar validación fiscal' })
  @HttpCode(200)
  @ApiTags('Admin — Organizaciones')
  @Post(':organizationUuid/reject')
  async rejectOrganization(
    @Param('organizationUuid') organizationUuid: string,
    @User() adminId: string,
    @Body() body: RejectOrganizationRequest
  ): Promise<OrganizationMeResponse> {
    const org = await this._organizationService.rejectOrganization(organizationUuid, adminId, body.reason);
    return this.toMeResponse(org);
  }

  @AdminAuth(null, OrganizationMeResponse)
  @ApiOperation({ summary: 'Aprobar cambio de cuenta bancaria' })
  @HttpCode(200)
  @ApiTags('Admin — Organizaciones')
  @Post(':organizationUuid/approve-bank-change')
  async approveBankAccountChange(
    @Param('organizationUuid') organizationUuid: string,
    @User() adminId: string
  ): Promise<OrganizationMeResponse> {
    const org = await this._organizationService.approveBankAccountChange(organizationUuid, adminId);
    return this.toMeResponse(org);
  }

  @AdminAuth(RejectOrganizationRequest, OrganizationMeResponse)
  @ApiOperation({ summary: 'Rechazar cambio de cuenta bancaria' })
  @HttpCode(200)
  @ApiTags('Admin — Organizaciones')
  @Post(':organizationUuid/reject-bank-change')
  async rejectBankAccountChange(
    @Param('organizationUuid') organizationUuid: string,
    @User() adminId: string,
    @Body() body: RejectOrganizationRequest
  ): Promise<OrganizationMeResponse> {
    const org = await this._organizationService.rejectBankAccountChange(
      organizationUuid,
      adminId,
      body.reason
    );
    return this.toMeResponse(org);
  }

  @AdminAuth(null, OrganizationMeResponse)
  @ApiOperation({ summary: 'Aprobar cambio de identidad fiscal' })
  @HttpCode(200)
  @ApiTags('Admin — Organizaciones')
  @Post(':organizationUuid/approve-fiscal-change')
  async approveFiscalIdentityChange(
    @Param('organizationUuid') organizationUuid: string,
    @User() adminId: string
  ): Promise<OrganizationMeResponse> {
    const org = await this._organizationService.approveFiscalIdentityChange(
      organizationUuid,
      adminId
    );
    return this.toMeResponse(org);
  }

  @AdminAuth(RejectOrganizationRequest, OrganizationMeResponse)
  @ApiOperation({ summary: 'Rechazar cambio de identidad fiscal' })
  @HttpCode(200)
  @ApiTags('Admin — Organizaciones')
  @Post(':organizationUuid/reject-fiscal-change')
  async rejectFiscalIdentityChange(
    @Param('organizationUuid') organizationUuid: string,
    @User() adminId: string,
    @Body() body: RejectOrganizationRequest
  ): Promise<OrganizationMeResponse> {
    const org = await this._organizationService.rejectFiscalIdentityChange(
      organizationUuid,
      adminId,
      body.reason
    );
    return this.toMeResponse(org);
  }

  @UserAuth(null, GetAllOrganizationResponse)
  @ApiOperation({
    summary: 'Listar productoras',
    description:
      'Lists organizations. Admins see all; other users only their memberships. Supports search, pagination and validationStatus filter.'
  })
  @ApiPagination()
  @ApiSearch()
  @ApiFilter(organizationFilters)
  @ApiOrder(ORGANIZATION_ORDER_COLUMNS)
  @ApiTags('Admin — Organizaciones')
  @Get()
  async getOrganizations(
    @PaginationParams() pagination: IPaginationParams,
    @SearchParams() search: ISearchParams,
    @FilterParams(organizationFilters) filters: IFiltersParams<typeof organizationFilters>,
    @OrderParams() order: IOrderParams<typeof ORGANIZATION_ORDER_COLUMNS>,
    @User() loggedUser: string
  ): Promise<{
    meta: PaginationMetaResponse;
    items: GetAllOrganizationResponse[];
  }> {
    const organization = await this._organizationService.getOrganizations(
      pagination,
      search,
      loggedUser,
      filters,
      order
    );
    const requestViews = await this._organizationService.getOrgRequestViews(
      organization.items.map(item => item.uuid)
    );
    return {
      meta: organization.meta,
      items: organization.items.map(
        item => new GetAllOrganizationResponse(item, requestViews.get(item.uuid) ?? {})
      )
    };
  }

  @UserAuth(null, OrganizationUsersListResponse)
  @ApiOperation({
    summary: 'Listar usuarios de productoras',
    description: 'Returns all users that belong to the organizations of the authenticated user'
  })
  @ApiPagination()
  @HttpCode(200)
  @ApiTags('Admin — Organizaciones')
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
    summary: 'Crear productora',
    description: 'This endpoint is for create organization'
  })
  @HttpCode(201)
  @ApiTags('Admin — Organizaciones')
  @Post()
  async createOrganization(@Body() data: CreateOrganizationRequest): Promise<boolean> {
    return await this._organizationService.createOrganization(data);
  }

  @UserAuth(null, GetIdOrganizationResponse)
  @ApiOperation({
    summary: 'Obtener productora',
    description: 'This endpoint is for get organization by id'
  })
  @HttpCode(200)
  @ApiSearch()
  @ApiTags('Admin — Organizaciones')
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
    summary: 'Actualizar productora',
    description: 'This endpoint is for update user'
  })
  @HttpCode(200)
  @ApiTags('Admin — Organizaciones')
  @Put(':organizationUuid')
  async updateOrganization(
    @Param('organizationUuid') organizationUuid: string,
    @Body() data: UpdateOrganizationRequest
  ): Promise<void> {
    await this._organizationService.updateOrganization(organizationUuid, data);
  }

  @UserAuth(AssignUserOrganizationRequest, null)
  @ApiOperation({
    summary: 'Asignar usuario a la productora',
    description: 'Creates a new user (same fields as POST /auth/register/client) and assigns them to the organization'
  })
  @HttpCode(201)
  @ApiTags('Admin — Organizaciones')
  @Post(':organizationUuid/assign-user')
  async assignUserOrganization(
    @Param('organizationUuid') organizationUuid: string,
    @Body() data: AssignUserOrganizationRequest
  ): Promise<boolean> {
    return await this._organizationService.assignUserOrganization(organizationUuid, data);
  }

  @AdminAuth(LinkUsersOrganizationRequest, null)
  @ApiOperation({
    summary: 'Vincular usuarios existentes',
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
  @ApiTags('Admin — Organizaciones')
  @Post(':organizationUuid/members')
  async linkUsersToOrganization(
    @Param('organizationUuid') organizationUuid: string,
    @Body() data: LinkUsersOrganizationRequest
  ): Promise<boolean> {
    return await this._organizationService.linkUsersToOrganization(organizationUuid, data.userUuids);
  }

  @UserAuth(UnassignUserOrganizationRequest, null)
  @ApiOperation({
    summary: 'Desasignar usuario de la productora',
    description: 'This endpoint is for unassign user to organization'
  })
  @HttpCode(201)
  @ApiTags('Admin — Organizaciones')
  @Delete(':organizationUuid/unassign-user')
  async unassignUserOrganization(
    @Param('organizationUuid') organizationUuid: string,
    @Body() data: UnassignUserOrganizationRequest
  ): Promise<boolean> {
    return await this._organizationService.unassignUserOrganization(organizationUuid, data);
  }

  @UserAuth(null, null)
  @ApiOperation({
    summary: 'Eliminar productora',
    description: 'This endpoint is for delete organization'
  })
  @HttpCode(200)
  @ApiTags('Admin — Organizaciones')
  @Delete(':organizationUuid')
  async deleteOrganization(@Param('organizationUuid') organizationUuid: string): Promise<boolean> {
    return await this._organizationService.deleteOrganization(organizationUuid);
  }

  private applyFiscalDownloadHeaders(res: Response, mimeType: string, originalName: string): void {
    const safeName = originalName.replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]/gi, '_').slice(0, 180);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
  }
}
