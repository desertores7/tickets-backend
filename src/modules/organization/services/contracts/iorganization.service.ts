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
import { OrganizationEntity } from '@config/db/entities/user/organization.entity';
import { organizationFilters } from '../../controllers/const/organization.filters';

export type TOrganizationResponse = TEntityResponse<'organization', undefined, undefined>;

export type TOrganizationResponseWithUserOrganizations = TEntityResponse<
  'organization',
  { userOrganizations: { user: { userRoles: { role: true } } } },
  undefined
>;

export type TUserOrganizationResponse = TEntityResponse<'user_organization', undefined, undefined>;

export type TOrganizationUserResponse = TEntityResponse<'user', undefined, undefined>;

export interface IOrganizationService {
  getOrganizations(
    pagination: IPaginationParams,
    search: ISearchParams,
    loggedUser: string,
    filters?: IFiltersParams<typeof organizationFilters>
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
  updateMyOrganization(userUuid: string, data: UpdateOrganizationMeRequest): Promise<OrganizationEntity>;
  submitMyOrganizationValidation(userUuid: string): Promise<OrganizationEntity>;
  approveOrganization(organizationUuid: string, adminUuid: string): Promise<OrganizationEntity>;
  rejectOrganization(organizationUuid: string, adminUuid: string, reason: string): Promise<OrganizationEntity>;
}
