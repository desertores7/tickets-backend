import { DBRepository } from '@config/db/db.repository';
import { TEntityResponse } from '@config/db/meta/db.types';
import { BadRequestException, Inject } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { IUserFileService } from '../contracts/iuser-file.service';
import { IUserFileCreate, IUserFileUpdate } from '../core/userFile';
import { FileEntity } from '@config/db/entities/user/file.entity';
import { IFiltersParams } from '@root/shared/decorators/filter-query.decorator';
import { userFileFilters } from '@modules/user-file/controllers/const/user-file.filters';

export class UserFileService implements IUserFileService {
  constructor(
    @Inject(DBRepository) private dbRepository: DBRepository,
    readonly dataSource: DataSource
  ) {}

  async createUserFile(data: IUserFileCreate): Promise<void> {
    if (!data.userUuid) throw new BadRequestException('User uuid is required');

    const userFile: FileEntity = new FileEntity();
    userFile.uuid = uuidv4();
    userFile.userUuid = data.userUuid;
    userFile.path = data.path;
    userFile.createdAt = new Date();
    await this.dbRepository.create({
      entity: 'file',
      data: userFile
    });
  }

  async getUserFile(
    userUuid: string,
    filters: IFiltersParams<typeof userFileFilters>
  ): Promise<TEntityResponse<'file', undefined, undefined>[]> {
    const userFile = await this.dbRepository.findMany({
      entity: 'file',
      where: { userUuid: userUuid }
    });

    if (!userFile) throw new BadRequestException('User file not found');

    return userFile;
  }

  async updateUserFile(id: string, data: IUserFileUpdate): Promise<void> {
    const userFile = await this.dbRepository.findOne({
      entity: 'file',
      where: { uuid: id }
    });

    if (!userFile) throw new BadRequestException('User file not found');

    await this.dbRepository.update({
      entity: 'file',
      where: { uuid: id },
      data: data
    });
  }

  async deleteUserFile(id: string): Promise<boolean> {
    const deleteUserFile = await this.dbRepository.delete({
      entity: 'file',
      where: { uuid: id }
    });

    if (!deleteUserFile) throw new BadRequestException('User file not found');

    return true;
  }
}
