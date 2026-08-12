import { TEntityResponse } from '@config/db/meta/db.types';
import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { ISearchParams } from '@root/shared/decorators/search-query.decorator';
import { IFiltersParams } from '@root/shared/decorators/filter-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { IUserCreate, IUserList, IUserUpdate } from '../core/user';
import { userFilters } from '../../controllers/const/user.filters';

export interface IUserService {
  getUsers(
    pagination: IPaginationParams,
    search: ISearchParams,
    filters?: IFiltersParams<typeof userFilters>
  ): Promise<{
    meta: PaginationMetaResponse;
    items: (TEntityResponse<'user', { files: true }, undefined> & {
      imgProfile: object;
      role: string;
      roleUuid: string;
      roleId: string;
    })[];
  }>;
  getListUsers(search: ISearchParams): Promise<IUserList[]>;
  createUser(data: IUserCreate): Promise<void>;
  getUserId(id: string): Promise<TEntityResponse<'user', undefined, undefined> & { role: string; roleUuid: string }>;
  updateUser(id: string, data: IUserUpdate): Promise<void>;
  deleteUser(arrayUuids: string[]): Promise<void>;
  assignRoleToUser(userUuid: string, roleUuid: string, assignedBy: string): Promise<void>;
}
