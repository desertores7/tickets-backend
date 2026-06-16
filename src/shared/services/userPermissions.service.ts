import { DBRepository } from '@config/db/db.repository';
import { EnvService } from '@config/env/env.service';
import { HttpService } from '@nestjs/axios';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { IsNull } from 'typeorm';

@Injectable()
export class UserPermissionService {
  constructor(
    @Inject(DBRepository) private dbRepository: DBRepository,
    protected readonly httpService: HttpService,
    private envService: EnvService
  ) {}

  async userPermission(userUuid: string) {
    const user = await this.dbRepository.findOne({
      entity: 'user_role',
      where: { userUuid: userUuid, isDeleted: IsNull() },
      relations: {
        role: true
      }
    });

    if (!user) throw new BadRequestException('User not found or doesnt exist');

    if (user.role.uuid === 'd2a84f98-a8b4-11f0-8c82-3f4dc2e949b2' || user.role.name === 'Administrador') {
      return true;
    } else {
      return false;
    }
  }
}
