import { TEntityResponse } from '@config/db/meta/db.types';
import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { ISearchParams } from '@root/shared/decorators/search-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import {
  IAssignUserOrganization,
  IOrganizationCreate,
  IOrganizationUpdate,
  IUnassignUserOrganization
} from '../core/organization';

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
    loggedUser: string
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
}
