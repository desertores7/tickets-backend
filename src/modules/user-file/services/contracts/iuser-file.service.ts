import { TEntityResponse } from '@config/db/meta/db.types';
import { IUserFileCreate, IUserFileUpdate } from '../core/userFile';
import { IFiltersParams } from '@root/shared/decorators/filter-query.decorator';
import { userFileFilters } from '@modules/user-file/controllers/const/user-file.filters';

export interface IUserFileService {
  createUserFile(data: IUserFileCreate): Promise<void>;
  getUserFile(
    userUuid: string,
    filters: IFiltersParams<typeof userFileFilters>
  ): Promise<TEntityResponse<'file', undefined, undefined>[]>;
  updateUserFile(id: string, data: IUserFileUpdate): Promise<void>;
  deleteUserFile(id: string): Promise<boolean>;
}
