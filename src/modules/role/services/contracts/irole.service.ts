import { TEntityResponse } from '@config/db/meta/db.types';
import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { ISearchParams } from '@root/shared/decorators/search-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { IRoleCreate, IRoleUpdate } from '../core/role';
import { QueryRunner } from 'typeorm';

export interface IRoleService {
  getRoles(
    pagination: IPaginationParams,
    search: ISearchParams
  ): Promise<{
    meta: PaginationMetaResponse;
    items: TEntityResponse<'role', undefined, undefined>[];
  }>;
  createRole(data: IRoleCreate, userId: string): Promise<void>;
  getRoleId(id: string): Promise<TEntityResponse<'role', undefined, undefined>>;
  getRoleByName(name: string): Promise<TEntityResponse<'role', undefined, undefined> | null>;
  getUserRoles(userUuid: string): Promise<TEntityResponse<'user_role', { role: true }, undefined>[]>;
  updateRole(id: string, data: IRoleUpdate, userId: string): Promise<void>;
  deleteRole(id: string): Promise<boolean>;
  assignRoleToUser(
    userUuid: string,
    roleUuid: string,
    assignedBy: string,
    queryRunner?: QueryRunner,
    skipUserValidation?: boolean
  ): Promise<void>;
}
