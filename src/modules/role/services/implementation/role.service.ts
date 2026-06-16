import { DBRepository } from '@config/db/db.repository';
import { TEntityResponse } from '@config/db/meta/db.types';
import { BadRequestException, ConflictException, Inject } from '@nestjs/common';
import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { ISearchParams } from '@root/shared/decorators/search-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { IRoleService } from '../contracts/irole.service';
import { ILike, DataSource, IsNull, QueryRunner } from 'typeorm';
import { IRoleCreate, IRoleUpdate } from '../core/role';
import { RoleEntity } from '@config/db/entities/user/role.entity';
import { UserRoleEntity } from '@config/db/entities/user/user_role.entity';
import { v4 as uuidv4 } from 'uuid';

export class RoleService implements IRoleService {
  constructor(
    @Inject(DBRepository) private dbRepository: DBRepository,
    readonly dataSource: DataSource
  ) {}

  async getRoles(
    pagination: IPaginationParams,
    search: ISearchParams
  ): Promise<{
    meta: PaginationMetaResponse;
    items: TEntityResponse<'role', undefined, undefined>[];
  }> {
    const role = await this.dbRepository.findManyAndCount({
      entity: 'role',
      where: {
        name: ILike(`%${search.search}%`),
        isDeleted: IsNull()
      },
      other: {
        take: pagination.limit,
        skip: (pagination.page - 1) * pagination.limit
      }
    });

    if (!role) throw new BadRequestException('Role not found');

    const meta = new PaginationMetaResponse({
      limit: pagination.limit,
      page: pagination.page,
      total: role.count
    });

    return {
      meta,
      items: role.items
    };
  }

  async createRole(data: IRoleCreate, userId: string): Promise<void> {
    // Verificar si ya existe un rol con el mismo nombre
    const existingRole = await this.dbRepository.findOne({
      entity: 'role',
      where: {
        name: data.name,
        isDeleted: IsNull()
      }
    });

    if (existingRole) {
      throw new BadRequestException(`Role with name '${data.name}' already exists`);
    }

    const role: RoleEntity = new RoleEntity();
    role.uuid = uuidv4();
    role.name = data.name;
    role.isDeleted = null;
    role.createdAt = new Date();
    role.updatedAt = new Date();
    role.createdBy = userId;
    role.updatedBy = userId;
    await this.dbRepository.create({
      entity: 'role',
      data: role
    });
  }

  async getRoleId(id: string): Promise<TEntityResponse<'role', undefined, undefined>> {
    const role = await this.dbRepository.findOne({
      entity: 'role',
      where: {
        uuid: id,
        isDeleted: IsNull()
      }
    });

    if (!role) throw new BadRequestException('Role not found');

    return role;
  }

  async getRoleByName(name: string): Promise<TEntityResponse<'role', undefined, undefined> | null> {
    const role = await this.dbRepository.findOne({
      entity: 'role',
      where: {
        name: name,
        isDeleted: IsNull()
      }
    });

    return role;
  }

  async getUserRoles(userUuid: string): Promise<TEntityResponse<'user_role', { role: true }, undefined>[]> {
    const userRoles = await this.dbRepository.findMany({
      entity: 'user_role',
      where: {
        userUuid: userUuid,
        isDeleted: IsNull()
      },
      relations: {
        role: true
      }
    });

    return userRoles;
  }

  async updateRole(id: string, data: IRoleUpdate, userId: string): Promise<void> {
    const role = await this.dbRepository.findOne({
      entity: 'role',
      where: {
        uuid: id,
        isDeleted: IsNull()
      }
    });

    if (!role) throw new BadRequestException('Role not found');

    // Verificar si ya existe otro rol con el mismo nombre (excluyendo el actual)
    const existingRole = await this.dbRepository.findOne({
      entity: 'role',
      where: {
        name: data.name,
        isDeleted: IsNull()
      }
    });

    if (existingRole && existingRole.uuid !== id) {
      throw new BadRequestException(`Role with name '${data.name}' already exists`);
    }

    await this.dbRepository.update({
      entity: 'role',
      where: { uuid: id },
      data: {
        ...data,
        updatedBy: userId,
        updatedAt: new Date()
      }
    });
  }

  async deleteRole(id: string): Promise<boolean> {
    const role = await this.dbRepository.findOne({
      entity: 'role',
      where: {
        uuid: id,
        isDeleted: IsNull()
      }
    });

    if (!role) throw new BadRequestException('Role not found');

    await this.dbRepository.update({
      entity: 'role',
      where: { uuid: id },
      data: { isDeleted: new Date() }
    });

    return true;
  }

  async assignRoleToUser(
    userUuid: string,
    roleUuid: string,
    assignedBy: string,
    queryRunner?: QueryRunner,
    skipUserValidation: boolean = false
  ): Promise<void> {
    // Validar que el usuario existe (solo si no se omite la validación)
    if (!skipUserValidation) {
      const user = await this.dbRepository.findOne({
        entity: 'user',
        where: { uuid: userUuid, isDeleted: IsNull() }
      });
      if (!user) {
        throw new BadRequestException('User not found');
      }
    }

    // Verificar que el rol existe
    try {
      await this.getRoleId(roleUuid);
    } catch (error) {
      throw new BadRequestException('Role does not exist');
    }

    // Verificar si el usuario ya tiene este rol asignado
    const existingUserRole = await this.dbRepository.findOne({
      entity: 'user_role',
      where: {
        userUuid: userUuid,
        roleUuid: roleUuid,
        isDeleted: IsNull()
      }
    });

    if (existingUserRole) {
      throw new ConflictException('User already has this role');
    }

    // Crear la asignación de rol
    const userRole = new UserRoleEntity();
    userRole.uuid = uuidv4();
    userRole.userUuid = userUuid;
    userRole.roleUuid = roleUuid;
    userRole.createdAt = new Date();
    userRole.createdBy = assignedBy;

    await this.dbRepository.create({
      entity: 'user_role',
      data: userRole,
      queryRunner: queryRunner
    });
  }
}
