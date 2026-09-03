import { TEntityResponse } from '@config/db/meta/db.types';
import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { ISearchParams } from '@root/shared/decorators/search-query.decorator';
import { IFiltersParams } from '@root/shared/decorators/filter-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import {
  IAssignUserOrganization,
  IOrganizationCreate,
  IOrganizationUpdate,
  IUnassignUserOrganization
} from '../core/organization';
import { UpdateOrganizationMeRequest } from '../../controllers/dtos/organization-me/update-organization-me.request';
import { RequestBankChangeRequest } from '../../controllers/dtos/organization-me/request-bank-change.request';
import { RequestFiscalChangeRequest } from '../../controllers/dtos/organization-me/request-fiscal-change.request';
import { OrganizationEntity } from '@config/db/entities/user/organization.entity';
import { FileEntity } from '@config/db/entities/user/file.entity';
import { ORGANIZATION_ORDER_COLUMNS, organizationFilters } from '../../controllers/const/organization.filters';
import { IOrderParams } from '@root/shared/decorators/order-query.decorator';
import type { OrgRequestView } from '../../controllers/dtos/organization-me/organization-me.response';

export type TOrganizationResponse = TEntityResponse<'organization', undefined, undefined>;

export type TOrganizationResponseWithUserOrganizations = TEntityResponse<
  'organization',
  { userOrganizations: { user: { userRoles: { role: true } } }; organizationStatus: true },
  undefined
>;

export type TUserOrganizationResponse = TEntityResponse<'user_organization', undefined, undefined>;

export type TOrganizationUserResponse = TEntityResponse<'user', undefined, undefined>;

export interface IOrganizationService {
  getOrganizations(
    pagination: IPaginationParams,
    search: ISearchParams,
    loggedUser: string,
    filters?: IFiltersParams<typeof organizationFilters>,
    order?: IOrderParams<typeof ORGANIZATION_ORDER_COLUMNS>
  ): Promise<{
    meta: PaginationMetaResponse;
    items: TOrganizationResponseWithUserOrganizations[];
  }>;
  createOrganization(data: IOrganizationCreate): Promise<boolean>;
  getOrganizationUsers(
    loggedUser: string,
    pagination: IPaginationParams
  ): Promise<{
    meta: PaginationMetaResponse;
    items: TOrganizationUserResponse[];
  }>;
  getOrganizationId(id: string, search: ISearchParams): Promise<TOrganizationResponseWithUserOrganizations>;
  updateOrganization(id: string, data: IOrganizationUpdate): Promise<void>;
  assignUserOrganization(organizationUuid: string, data: IAssignUserOrganization): Promise<boolean>;
  linkUsersToOrganization(organizationUuid: string, userUuids: string[]): Promise<boolean>;

  unassignUserOrganization(organizationUuid: string, data: IUnassignUserOrganization): Promise<boolean>;
  deleteOrganization(id: string): Promise<boolean>;

  getMyOrganization(userUuid: string): Promise<OrganizationEntity>;
  getOrgRequestView(organizationUuid: string): Promise<OrgRequestView>;
  getOrgRequestViews(organizationUuids: string[]): Promise<Map<string, OrgRequestView>>;
  updateMyOrganization(userUuid: string, data: UpdateOrganizationMeRequest): Promise<OrganizationEntity>;
  submitMyOrganizationValidation(userUuid: string): Promise<OrganizationEntity>;
  requestBankAccountChange(
    userUuid: string,
    data: RequestBankChangeRequest
  ): Promise<OrganizationEntity>;
  approveBankAccountChange(organizationUuid: string, adminUuid: string): Promise<OrganizationEntity>;
  rejectBankAccountChange(
    organizationUuid: string,
    adminUuid: string,
    reason: string
  ): Promise<OrganizationEntity>;
  requestFiscalIdentityChange(
    userUuid: string,
    data: RequestFiscalChangeRequest,
    files?: Express.Multer.File[]
  ): Promise<OrganizationEntity>;
  approveFiscalIdentityChange(
    organizationUuid: string,
    adminUuid: string
  ): Promise<OrganizationEntity>;
  rejectFiscalIdentityChange(
    organizationUuid: string,
    adminUuid: string,
    reason: string
  ): Promise<OrganizationEntity>;
  approveOrganization(organizationUuid: string, adminUuid: string): Promise<OrganizationEntity>;
  rejectOrganization(organizationUuid: string, adminUuid: string, reason: string): Promise<OrganizationEntity>;

  listMyFiscalDocuments(userUuid: string): Promise<FileEntity[]>;
  uploadMyFiscalDocument(
    userUuid: string,
    file: Express.Multer.File,
    documentKindRaw?: unknown
  ): Promise<FileEntity>;
  deleteMyFiscalDocument(userUuid: string, documentUuid: string): Promise<void>;
  getMyFiscalDocumentDownload(
    userUuid: string,
    documentUuid: string
  ): Promise<{ absolutePath: string; mimeType: string; originalName: string }>;

  listOrganizationFiscalDocuments(organizationUuid: string): Promise<FileEntity[]>;
  getOrganizationFiscalDocumentDownload(
    organizationUuid: string,
    documentUuid: string
  ): Promise<{ absolutePath: string; mimeType: string; originalName: string }>;
}
