import { DBRepository } from '@config/db/db.repository';
import { TEntityResponse } from '@config/db/meta/db.types';
import { BadRequestException, Inject } from '@nestjs/common';
import { IUserService } from '../contracts/iuser.service';
import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { ISearchParams } from '@root/shared/decorators/search-query.decorator';
import { IFiltersParams } from '@root/shared/decorators/filter-query.decorator';
import { userFilters } from '../../controllers/const/user.filters';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { v4 as uuidv4 } from 'uuid';
import { ILike, DataSource, In, IsNull, Raw } from 'typeorm';
import { IUserCreate, IUserList, IUserUpdate } from '../core/user';
import { UserEntity } from '@config/db/entities/user/user.entity';
import * as bcryptjs from 'bcryptjs';
import { EnvService } from '@config/env/env.service';
import { EmailService } from '@root/shared/auth/services/email.service';
import { AuthService } from '@modules/auth/services/implementation/auth.service';
import { IRoleService } from '@modules/role/services/contracts/irole.service';
import { ISystemParameterService } from '@modules/system-parameter/services/contracts/isystem-parameter.service';
import { UserOrganizationEntity } from '@config/db/entities/user/user_organization.entity';
import { isProfileFile } from '@config/db/const/file-type.const';
import { FileEntity } from '@config/db/entities/user/file.entity';

export class UserService implements IUserService {
  constructor(
    @Inject(DBRepository) private dbRepository: DBRepository,
    readonly dataSource: DataSource,
    private readonly envService: EnvService,
    private readonly emailService: EmailService,
    private readonly authService: AuthService,
    @Inject('IRoleService') private readonly roleService: IRoleService,
    @Inject('ISystemParameterService') private readonly systemParameterService: ISystemParameterService
  ) {}

  public async hash(v: string) {
    const salt = await bcryptjs.genSalt(10);
    return bcryptjs.hash(v, salt);
  }

  async getUsers(
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
  }> {
    // Construir condiciones base
    const baseConditions: any[] = search.search
      ? [
          { firstName: ILike(`%${search.search}%`), isDeleted: IsNull() },
          { lastName: ILike(`%${search.search}%`), isDeleted: IsNull() },
          { email: ILike(`%${search.search}%`), isDeleted: IsNull() },
          {
            isDeleted: IsNull(),
            firstName: Raw(alias => `LOWER(CONCAT(${alias}, ' ', "lastName")) LIKE LOWER(:search)`, {
              search: `%${search.search}%`
            })
          }
        ]
      : [{ isDeleted: IsNull() }];

    // Aplicar filtros
    let whereConditions: any = baseConditions;

    // Verificar si hay filtros para aplicar
    const hasRoleFilter = filters?.roleUuid && filters.roleUuid.length > 0;
    const hasActiveFilter = filters?.activeUser && filters.activeUser.length > 0;

    if (hasRoleFilter || hasActiveFilter) {
      whereConditions = baseConditions.map(condition => {
        const newCondition: any = { ...condition };

        // Aplicar filtro por roleUuid si existe
        if (hasRoleFilter) {
          newCondition.userRoles = {
            roleUuid: In(filters!.roleUuid!),
            isDeleted: IsNull()
          };
        }

        // Aplicar filtro por activeUser si existe
        if (hasActiveFilter) {
          const activeValues = filters!.activeUser!.map(v => parseInt(v)).filter(v => !isNaN(v));
          if (activeValues.length > 0) {
            newCondition.active = In(activeValues);
          }
        }

        return newCondition;
      });
    }

    const user = await this.dbRepository.findManyAndCount({
      entity: 'user',
      where: whereConditions,
      relations: {
        files: true,
        userRoles: {
          role: true
        },
        userOrganizations: true
      },
      other: {
        take: pagination.limit,
        skip: (pagination.page - 1) * pagination.limit,
        order: {
          createdAt: 'DESC'
        }
      }
    });

    if (!user) throw new BadRequestException('User not found');

    const meta = new PaginationMetaResponse({
      limit: pagination.limit,
      page: pagination.page,
      total: user.count
    });

    const items: any[] = user.items.map((item: any) => {
      const dataRole = item.userRoles?.find((role: any) => role.userUuid === item.uuid)?.role;
      const profileFile = item.files?.find((file: FileEntity) => isProfileFile(file));
      const organizationUuids = (item.userOrganizations ?? [])
        .map((uo: any) => uo.organizationUuid)
        .filter((u: string) => u != null);
      return {
        ...item,
        organizationUuids,
        imgProfile: {
          url: profileFile?.path || '',
          type: profileFile?.type || ''
        },
        role: dataRole?.name || '',
        roleUuid: dataRole?.uuid || '',
        roleId: dataRole?.uuid || ''
      };
    });

    return {
      meta,
      items
    };
  }

  async getListUsers(search: ISearchParams): Promise<IUserList[]> {
    const where = search.search
      ? [
          { isDeleted: IsNull(), firstName: ILike(`%${search.search}%`) },
          { isDeleted: IsNull(), lastName: ILike(`%${search.search}%`) }
        ]
      : { isDeleted: IsNull() };

    const users = await this.dbRepository.findMany({
      entity: 'user',
      where,
      relations: { userOrganizations: true },
      other: {
        order: {
          firstName: 'ASC',
          lastName: 'ASC'
        }
      }
    });

    return (users ?? []).map((item: any) => ({
      uuid: item.uuid,
      name: `${item.firstName} ${item.lastName}`.trim(),
      username: item.username,
      organizationUuids: (item.userOrganizations ?? [])
        .map((uo: any) => uo.organizationUuid)
        .filter((u: string) => u != null)
    }));
  }

  async createUser(data: IUserCreate): Promise<void> {
    const user = await this.dbRepository.findOne({
      entity: 'user',
      where: { email: data.email }
    });
    if (user) throw new BadRequestException('El email ya se encuentra registrado');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const user: UserEntity = new UserEntity();
      const userUuid = uuidv4();
      user.uuid = userUuid;
      user.firstName = data.firstName;
      user.lastName = data.lastName;
      user.email = data.email;
      user.dni = null; // Valor por defecto null
      user.gender = null; // Valor por defecto null
      user.birthday = null;
      user.isDeleted = null;
      const hash = await this.hash(data.password);
      user.password = hash;
      user.active = 1;
      user.createdAt = new Date();
      user.createdBy = userUuid;
      await this.dbRepository.create({
        entity: 'user',
        data: user,
        queryRunner: queryRunner
      });

      const { access, refresh } = await this.authService.signTokens(user);
      await this.authService.createTokenSession(userUuid, access, refresh, queryRunner);

      if (data.roleUuid) {
        try {
          const role = await this.roleService.getRoleId(data.roleUuid);
        } catch (error) {
          throw new BadRequestException('Role does not exist');
        }

        // Asignar el rol al usuario usando RoleService (siempre se asigna un rol, por defecto "Vendedor")
        await this.roleService.assignRoleToUser(userUuid, data.roleUuid, userUuid, queryRunner, true);
      }

      // imgProfile: ya no se sube nada al bucket; se omite la subida

      // Asociar usuario a organización si se proporciona organizationUuid
      if (data.organizationUuid) {
        // Validar que la organización existe
        const organization = await this.dbRepository.findOne({
          entity: 'organization',
          where: { uuid: data.organizationUuid, isDeleted: IsNull() }
        });

        if (!organization) {
          throw new BadRequestException('Organization does not exist');
        }

        // Crear registro de asociación usuario-organización
        const userOrganization: UserOrganizationEntity = new UserOrganizationEntity();
        userOrganization.uuid = uuidv4();
        userOrganization.userUuid = userUuid;
        userOrganization.organizationUuid = data.organizationUuid;
        userOrganization.isDeleted = null;
        userOrganization.createdAt = new Date();
        userOrganization.updatedAt = new Date();
        userOrganization.createdBy = userUuid;

        await this.dbRepository.create({
          entity: 'user_organization',
          data: userOrganization,
          queryRunner: queryRunner
        });
      }

      // Commit de la transacción antes de enviar el correo
      // Esto asegura que el usuario se guarde incluso si el correo falla
      await queryRunner.commitTransaction();

      // Enviar correo de bienvenida fuera de la transacción
      // Si falla, solo se loguea el error pero no afecta la creación del usuario
      try {
        await this.emailService.mail();
        await this.emailService.sendNewUserEmail({
          firstName: user.firstName,
          lastName: user.lastName,
          email: data.email
        });
      } catch (emailError) {
        // Log del error pero no lanzar excepción para no afectar la creación del usuario
        console.error('Error al enviar correo de bienvenida:', emailError);
        // Opcionalmente, podrías usar un logger aquí en lugar de console.error
      }
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getUserId(
    id: string
  ): Promise<TEntityResponse<'user', undefined, undefined> & { role: string; roleUuid: string }> {
    const user = await this.dbRepository.findOne({
      entity: 'user',
      relations: {
        userRoles: {
          role: true
        }
      },
      where: { uuid: id, isDeleted: IsNull() }
    });

    if (!user) throw new BadRequestException('User not found');

    const dataRole = user.userRoles?.find(role => role.userUuid === id)?.role;

    return {
      ...user,
      role: dataRole?.name || '',
      roleUuid: dataRole?.uuid || ''
    };
  }

  async updateUser(id: string, data: IUserUpdate): Promise<void> {
    await this.getUserId(id);

    if (data.email) {
      const existingUser = await this.dbRepository.findOne({
        entity: 'user',
        where: { email: data.email, isDeleted: IsNull() }
      });
      if (existingUser && existingUser.uuid !== id) {
        throw new BadRequestException('El email ya se encuentra registrado');
      }
    }

    const { roleUuid, password, ...scalarRest } = data;

    let usernameToSet: string | null | undefined = undefined;
    if (scalarRest.username !== undefined) {
      usernameToSet = scalarRest.username?.trim() ? scalarRest.username.trim() : null;
      if (usernameToSet) {
        const existingByUsername = await this.dbRepository.findOne({
          entity: 'user',
          where: { username: usernameToSet, isDeleted: IsNull() }
        });
        if (existingByUsername && existingByUsername.uuid !== id) {
          throw new BadRequestException('El nombre de usuario ya se encuentra registrado');
        }
      }
    }

    const userData: Partial<UserEntity> = {};
    if (scalarRest.firstName !== undefined) userData.firstName = scalarRest.firstName;
    if (scalarRest.lastName !== undefined) userData.lastName = scalarRest.lastName;
    if (scalarRest.email !== undefined) userData.email = scalarRest.email;
    if (usernameToSet !== undefined) userData.username = usernameToSet;
    if (scalarRest.active !== undefined) userData.active = scalarRest.active;
    if (scalarRest.dni !== undefined) userData.dni = scalarRest.dni;
    if (scalarRest.gender !== undefined) userData.gender = scalarRest.gender;
    if (scalarRest.birthday !== undefined) userData.birthday = scalarRest.birthday;

    if (password?.trim()) {
      userData.password = await this.hash(password);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      if (roleUuid) {
        await this.roleService.getRoleId(roleUuid);
        const activeRoles = await this.dbRepository.findMany({
          entity: 'user_role',
          where: { userUuid: id, isDeleted: IsNull() }
        });
        for (const ur of activeRoles) {
          await this.dbRepository.update({
            entity: 'user_role',
            where: { uuid: ur.uuid },
            data: { isDeleted: new Date(), updatedBy: id },
            queryRunner
          });
        }
        await this.roleService.assignRoleToUser(id, roleUuid, id, queryRunner, true);
      }

      const hasUserFieldUpdates = Object.keys(userData).length > 0;
      if (hasUserFieldUpdates) {
        userData.updatedBy = id;
        await this.dbRepository.update({
          entity: 'user',
          where: { uuid: id },
          data: userData,
          queryRunner: queryRunner
        });
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async deleteUser(arrayUuids: string[]): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      for (const id of arrayUuids) {
        await this.dbRepository.update({
          entity: 'user',
          where: { uuid: id },
          data: { isDeleted: new Date(), updatedBy: id },
          queryRunner
        });
      }
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async assignRoleToUser(userUuid: string, roleUuid: string, assignedBy: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Asignar el rol al usuario usando RoleService
      await this.roleService.assignRoleToUser(userUuid, roleUuid, assignedBy, queryRunner);

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

}
