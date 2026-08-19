import { DBRepository } from '@config/db/db.repository';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { IAuthService } from '@modules/auth/services/contracts/iauth.service';
import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { ISearchParams } from '@root/shared/decorators/search-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { ILike, DataSource, IsNull, In } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  IOrganizationService,
  TOrganizationResponseWithUserOrganizations,
  TOrganizationUserResponse
} from '../contracts/iorganization.service';
import {
  IAssignUserOrganization,
  IOrganizationCreate,
  IOrganizationUpdate,
  IUnassignUserOrganization
} from '../core/organization';
import { OrganizationEntity } from '@config/db/entities/user/organization.entity';
import { UserOrganizationEntity } from '@config/db/entities/user/user_organization.entity';
import { UserPermissionService } from '@root/shared/services/userPermissions.service';

@Injectable()
export class OrganizationService implements IOrganizationService {
  constructor(
    @Inject(DBRepository) private dbRepository: DBRepository,
    @Inject('IAuthService') private readonly authService: IAuthService,
    private readonly user: UserPermissionService,
    readonly dataSource: DataSource
  ) {}

  async getOrganizations(
    pagination: IPaginationParams,
    search: ISearchParams,
    loggedUser: string
  ): Promise<{
    meta: PaginationMetaResponse;
    items: TOrganizationResponseWithUserOrganizations[];
  }> {
    const isAdmin = await this.user.userPermission(loggedUser);

    const baseWhere = { name: ILike(`%${search.search}%`), isDeleted: IsNull() } as const;
    let filteredOrganizationUuids: string[] | null = null;
    if (!isAdmin) {
      const orgsForUser = await this.dbRepository.findMany({
        entity: 'organization',
        where: [
          {
            ...baseWhere,
            userOrganizations: { userUuid: loggedUser }
          }
        ],
        select: { uuid: true } as any
      });
      filteredOrganizationUuids = orgsForUser.map((o: any) => o.uuid);
    }

    const finalWhere =
      Array.isArray(filteredOrganizationUuids) && filteredOrganizationUuids.length > 0
        ? { uuid: In(filteredOrganizationUuids), ...baseWhere }
        : { ...baseWhere };

    const organization = await this.dbRepository.findManyAndCount({
      entity: 'organization',
      where: finalWhere,
      relations: {
        userOrganizations: { user: true }
      },
      other: {
        order: { createdAt: 'DESC' }
      }
    });

    if (!organization) throw new BadRequestException('Organización no encontrada');

    const items = organization.items as TOrganizationResponseWithUserOrganizations[];

    const meta = new PaginationMetaResponse({
      limit: pagination.limit,
      page: pagination.page,
      total: organization.count
    });

    return { meta, items };
  }

  async getOrganizationUsers(
    loggedUser: string,
    pagination: IPaginationParams
  ): Promise<{
    meta: PaginationMetaResponse;
    items: TOrganizationUserResponse[];
  }> {
    const userOrganizations = await this.dbRepository.findMany({
      entity: 'user_organization',
      where: { userUuid: loggedUser, isDeleted: IsNull() }
    });

    if (!userOrganizations.length) {
      throw new BadRequestException('El usuario no pertenece a ninguna organización');
    }

    const organizationUuids = [...new Set(userOrganizations.map(uo => uo.organizationUuid))];

    const organizationUsers = await this.dbRepository.findMany({
      entity: 'user_organization',
      where: { organizationUuid: In(organizationUuids), isDeleted: IsNull() },
      relations: { user: true }
    });

    const uniqueUserUuids = [
      ...new Set(
        organizationUsers
          .filter(assignment => assignment.user?.uuid && assignment.user.isDeleted == null)
          .map(assignment => assignment.user.uuid)
      )
    ];

    if (uniqueUserUuids.length === 0) {
      return {
        meta: new PaginationMetaResponse({
          limit: pagination.limit,
          page: pagination.page,
          total: 0
        }),
        items: []
      };
    }

    const result = await this.dbRepository.findManyAndCount({
      entity: 'user',
      where: { uuid: In(uniqueUserUuids), isDeleted: IsNull() },
      other: {
        take: pagination.limit,
        skip: (pagination.page - 1) * pagination.limit,
        order: { firstName: 'ASC', lastName: 'ASC' }
      }
    });

    const meta = new PaginationMetaResponse({
      limit: pagination.limit,
      page: pagination.page,
      total: result.count
    });

    return { meta, items: result.items };
  }

  async createOrganization(data: IOrganizationCreate): Promise<boolean> {
    const organization: OrganizationEntity = new OrganizationEntity();
    organization.uuid = uuidv4();
    organization.name = data.name;
    organization.createdAt = new Date();
    await this.dbRepository.create({
      entity: 'organization',
      data: organization
    });
    return true;
  }

  async getOrganizationId(id: string, search: ISearchParams): Promise<TOrganizationResponseWithUserOrganizations> {
    const organization = await this.dbRepository.findOne({
      entity: 'organization',
      where: { uuid: id, isDeleted: IsNull() },
      // Se traen los roles para poder separar productores de validadores:
      // ambos son miembros de la organización, la diferencia está en el rol.
      relations: { userOrganizations: { user: { userRoles: { role: true } } } }
    });

    if (!organization) throw new BadRequestException('Organización no encontrada');

    if (search.search) {
      const term = search.search.toLowerCase();
      organization.userOrganizations = (organization.userOrganizations ?? []).filter(
        (uo: { user: { firstName?: string; lastName?: string } }) =>
          uo.user.firstName?.toLowerCase().includes(term) || uo.user.lastName?.toLowerCase().includes(term)
      ) as any;
    }

    return organization;
  }

  async updateOrganization(id: string, data: IOrganizationUpdate): Promise<void> {
    const organization = await this.dbRepository.findOne({
      entity: 'organization',
      where: { uuid: id }
    });

    if (!organization) throw new BadRequestException('Organización no encontrada');

    await this.dbRepository.update({
      entity: 'organization',
      where: { uuid: id },
      data: { name: data.name }
    });
  }

  async assignUserOrganization(organizationUuid: string, data: IAssignUserOrganization): Promise<boolean> {
    const organization = await this.dbRepository.findOne({
      entity: 'organization',
      where: { uuid: organizationUuid, isDeleted: IsNull() }
    });
    if (!organization) throw new BadRequestException('Organización no encontrada');

    const { uuid: userUuid } = await this.authService.registerAuth({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      password: data.password
    });

    const existingAssignment = await this.dbRepository.findOne({
      entity: 'user_organization',
      where: { organizationUuid, userUuid, isDeleted: IsNull() } as any
    });
    if (existingAssignment) {
      throw new BadRequestException('El usuario ya está asignado a la organización');
    }

    const userOrganization: UserOrganizationEntity = new UserOrganizationEntity();
    userOrganization.uuid = uuidv4();
    userOrganization.userUuid = userUuid;
    userOrganization.organizationUuid = organizationUuid;
    userOrganization.createdAt = new Date();
    await this.dbRepository.create({
      entity: 'user_organization',
      data: userOrganization
    });

    return true;
  }

  /**
   * Vincula usuarios ya existentes a una organización (no crea usuarios).
   * Idempotente: si el vínculo ya existe no hace nada; si estaba dado de baja
   * lo reactiva. Así reasignar a alguien que fue removido no duplica filas.
   */
  async linkUsersToOrganization(organizationUuid: string, userUuids: string[]): Promise<boolean> {
    const organization = await this.dbRepository.findOne({
      entity: 'organization',
      where: { uuid: organizationUuid, isDeleted: IsNull() }
    });
    if (!organization) throw new BadRequestException('Organización no encontrada');

    if (!userUuids?.length) return true;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const userUuid of userUuids) {
        const user = await this.dbRepository.findOne({
          entity: 'user',
          where: { uuid: userUuid, isDeleted: IsNull() }
        });
        if (!user) throw new BadRequestException(`Usuario ${userUuid} no encontrado`);

        const existing = await this.dbRepository.findOne({
          entity: 'user_organization',
          where: { organizationUuid, userUuid } as any
        });

        if (existing) {
          if (existing.isDeleted) {
            await queryRunner.manager.update(UserOrganizationEntity, { uuid: existing.uuid }, { isDeleted: null });
          }
          continue;
        }

        const link = new UserOrganizationEntity();
        link.uuid = uuidv4();
        link.userUuid = userUuid;
        link.organizationUuid = organizationUuid;
        link.createdAt = new Date();
        await queryRunner.manager.save(UserOrganizationEntity, link);
      }

      await queryRunner.commitTransaction();
      return true;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async unassignUserOrganization(organizationUuid: string, data: IUnassignUserOrganization): Promise<boolean> {
    if (!data.userUuids?.length) return true;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      for (const userUuid of data.userUuids) {
        await this.dbRepository.delete({
          entity: 'user_organization',
          where: { organizationUuid, userUuid },
          queryRunner
        });
      }
      await queryRunner.commitTransaction();
      return true;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async deleteOrganization(id: string): Promise<boolean> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.manager.update(OrganizationEntity, { uuid: id }, { isDeleted: new Date() });
      await queryRunner.manager.update(UserOrganizationEntity, { organizationUuid: id }, { isDeleted: new Date() });

      await queryRunner.commitTransaction();
      return true;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
