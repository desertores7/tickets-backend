import { DBRepository } from '@config/db/db.repository';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IAuthService } from '@modules/auth/services/contracts/iauth.service';
import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { ISearchParams } from '@root/shared/decorators/search-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { ILike, DataSource, IsNull, In, Not, Or } from 'typeorm';
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
import { UpdateOrganizationMeRequest } from '../../controllers/dtos/organization-me/update-organization-me.request';
import type { OrganizationValidationStatus } from '@modules/organization/const/organization-fiscal.const';
import { organizationFilters } from '../../controllers/const/organization.filters';
import { IFiltersParams } from '@root/shared/decorators/filter-query.decorator';
import { EmailService } from '@root/shared/auth/services/email.service';

export type TOrganizationFilters = IFiltersParams<typeof organizationFilters>;

@Injectable()
export class OrganizationService implements IOrganizationService {
  private readonly logger = new Logger(OrganizationService.name);

  constructor(
    @Inject(DBRepository) private dbRepository: DBRepository,
    @Inject('IAuthService') private readonly authService: IAuthService,
    private readonly user: UserPermissionService,
    private readonly emailService: EmailService,
    readonly dataSource: DataSource
  ) {}

  async getOrganizations(
    pagination: IPaginationParams,
    search: ISearchParams,
    loggedUser: string,
    filters?: TOrganizationFilters
  ): Promise<{
    meta: PaginationMetaResponse;
    items: TOrganizationResponseWithUserOrganizations[];
  }> {
    const isAdmin = await this.user.userPermission(loggedUser);
    const searchTerm = (search.search ?? '').trim();

    const baseWhere: Record<string, unknown> = { isDeleted: IsNull() };

    if (filters?.validationStatus?.length) {
      baseWhere.validationStatus =
        filters.validationStatus.length === 1
          ? filters.validationStatus[0]
          : In(filters.validationStatus);
    }

    let filteredOrganizationUuids: string[] | null = null;
    if (!isAdmin) {
      const orgsForUser = await this.dbRepository.findMany({
        entity: 'organization',
        where: [
          {
            isDeleted: IsNull(),
            userOrganizations: { userUuid: loggedUser }
          }
        ],
        select: { uuid: true } as any
      });
      filteredOrganizationUuids = orgsForUser.map((o: any) => o.uuid);
      if (!filteredOrganizationUuids.length) {
        return {
          meta: new PaginationMetaResponse({
            limit: pagination.limit,
            page: pagination.page,
            total: 0
          }),
          items: []
        };
      }
    }

    const searchWhere = searchTerm
      ? Or(
          { ...baseWhere, name: ILike(`%${searchTerm}%`) } as any,
          { ...baseWhere, legalName: ILike(`%${searchTerm}%`) } as any,
          { ...baseWhere, taxId: ILike(`%${searchTerm}%`) } as any
        )
      : baseWhere;

    let finalWhere: any = searchWhere;
    if (filteredOrganizationUuids) {
      if (searchTerm) {
        finalWhere = Or(
          { uuid: In(filteredOrganizationUuids), ...baseWhere, name: ILike(`%${searchTerm}%`) } as any,
          {
            uuid: In(filteredOrganizationUuids),
            ...baseWhere,
            legalName: ILike(`%${searchTerm}%`)
          } as any,
          { uuid: In(filteredOrganizationUuids), ...baseWhere, taxId: ILike(`%${searchTerm}%`) } as any
        );
      } else {
        finalWhere = { uuid: In(filteredOrganizationUuids), ...baseWhere };
      }
    }

    const organization = await this.dbRepository.findManyAndCount({
      entity: 'organization',
      where: finalWhere,
      relations: {
        userOrganizations: { user: true }
      },
      other: {
        take: pagination.limit,
        skip: (pagination.page - 1) * pagination.limit,
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
      documentType: data.documentType,
      documentNumber: data.documentNumber,
      email: data.email,
      password: data.password,
      acceptedTerms: true
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

  private async resolveMembershipOrganization(userUuid: string): Promise<OrganizationEntity> {
    const membership = await this.dbRepository.findOne({
      entity: 'user_organization',
      where: { userUuid, isDeleted: IsNull() },
      relations: { organization: true },
      other: { order: { createdAt: 'ASC' } }
    });

    if (!membership?.organization || membership.organization.isDeleted) {
      throw new NotFoundException('No tenés una productora asociada');
    }

    return membership.organization as OrganizationEntity;
  }

  async getMyOrganization(userUuid: string): Promise<OrganizationEntity> {
    return this.resolveMembershipOrganization(userUuid);
  }

  async updateMyOrganization(userUuid: string, data: UpdateOrganizationMeRequest): Promise<OrganizationEntity> {
    const org = await this.resolveMembershipOrganization(userUuid);

    if (org.validationStatus === 'pending_review') {
      throw new BadRequestException('La solicitud está en revisión. No se pueden editar los datos hasta la resolución.');
    }

    if (data.taxId !== undefined) {
      const normalizedTaxId = data.taxId.replace(/\D/g, '');
      if (normalizedTaxId.length < 10 || normalizedTaxId.length > 11) {
        throw new BadRequestException('CUIT/CUIL inválido');
      }
      const duplicate = await this.dbRepository.findOne({
        entity: 'organization',
        where: { taxId: normalizedTaxId, isDeleted: IsNull(), uuid: Not(org.uuid) }
      });
      if (duplicate) {
        throw new BadRequestException('Ya existe una productora con ese CUIT/CUIL');
      }
      data = { ...data, taxId: normalizedTaxId };
    }

    const patch: Partial<OrganizationEntity> = { updatedBy: userUuid };
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.legalName !== undefined) patch.legalName = data.legalName.trim();
    if (data.taxId !== undefined) patch.taxId = data.taxId;
    if (data.taxCondition !== undefined) patch.taxCondition = data.taxCondition;
    if (data.contactPhone !== undefined) patch.contactPhone = data.contactPhone.trim();
    if (data.contactEmail !== undefined) patch.contactEmail = data.contactEmail.trim();
    if (data.verificationReference !== undefined) {
      patch.verificationReference = data.verificationReference.trim();
    }
    if (data.bankAccount !== undefined) patch.bankAccount = data.bankAccount.trim();

    // Edición post-aprobada: vuelve a revisión (BR-PROD-011 lite; sin mover eventos aún).
    if (org.validationStatus === 'approved') {
      patch.validationStatus = 'pending_review';
      patch.validationSubmittedAt = new Date();
      patch.validationResolvedAt = null;
      patch.rejectionReason = null;
    } else if (org.validationStatus === 'rejected') {
      patch.validationStatus = 'draft_incomplete';
      patch.rejectionReason = null;
    }

    await this.dbRepository.update({
      entity: 'organization',
      where: { uuid: org.uuid },
      data: patch
    });

    return this.resolveMembershipOrganization(userUuid);
  }

  async submitMyOrganizationValidation(userUuid: string): Promise<OrganizationEntity> {
    const org = await this.resolveMembershipOrganization(userUuid);

    if (org.validationStatus === 'pending_review') {
      throw new BadRequestException('La solicitud ya está en revisión');
    }
    if (org.validationStatus === 'approved') {
      throw new BadRequestException('La productora ya está aprobada');
    }

    const missing: string[] = [];
    if (!org.legalName?.trim()) missing.push('razón social');
    if (!org.taxId?.trim()) missing.push('CUIT/CUIL');
    if (!org.taxCondition) missing.push('condición fiscal');
    if (!org.contactPhone?.trim()) missing.push('teléfono');
    if (!org.contactEmail?.trim()) missing.push('email de contacto');
    if (!org.verificationReference?.trim()) missing.push('referencia verificable');
    if (!org.bankAccount?.trim()) missing.push('CBU/alias');

    if (missing.length) {
      throw new BadRequestException(`Completá: ${missing.join(', ')}`);
    }

    await this.dbRepository.update({
      entity: 'organization',
      where: { uuid: org.uuid },
      data: {
        validationStatus: 'pending_review' satisfies OrganizationValidationStatus,
        validationSubmittedAt: new Date(),
        rejectionReason: null,
        updatedBy: userUuid
      }
    });

    return this.resolveMembershipOrganization(userUuid);
  }

  async approveOrganization(organizationUuid: string, adminUuid: string): Promise<OrganizationEntity> {
    const org = await this.dbRepository.findOne({
      entity: 'organization',
      where: { uuid: organizationUuid, isDeleted: IsNull() }
    });
    if (!org) throw new NotFoundException('Organización no encontrada');
    if (org.validationStatus !== 'pending_review') {
      throw new BadRequestException('Solo se pueden aprobar solicitudes en revisión');
    }

    await this.dbRepository.update({
      entity: 'organization',
      where: { uuid: org.uuid },
      data: {
        validationStatus: 'approved',
        validationResolvedAt: new Date(),
        rejectionReason: null,
        updatedBy: adminUuid
      }
    });

    const updated = await this.dbRepository.findOne({
      entity: 'organization',
      where: { uuid: org.uuid }
    });
    if (!updated) throw new NotFoundException('Organización no encontrada');

    this.notifyOwnerValidationResult(updated as OrganizationEntity, 'approved').catch(err => {
      this.logger.error(`Failed to send org approved email for ${organizationUuid}`, err?.stack);
    });

    return updated as OrganizationEntity;
  }

  async rejectOrganization(
    organizationUuid: string,
    adminUuid: string,
    reason: string
  ): Promise<OrganizationEntity> {
    const org = await this.dbRepository.findOne({
      entity: 'organization',
      where: { uuid: organizationUuid, isDeleted: IsNull() }
    });
    if (!org) throw new NotFoundException('Organización no encontrada');
    if (org.validationStatus !== 'pending_review') {
      throw new BadRequestException('Solo se pueden rechazar solicitudes en revisión');
    }

    const trimmedReason = reason.trim();

    await this.dbRepository.update({
      entity: 'organization',
      where: { uuid: org.uuid },
      data: {
        validationStatus: 'rejected',
        validationResolvedAt: new Date(),
        rejectionReason: trimmedReason,
        updatedBy: adminUuid
      }
    });

    const updated = await this.dbRepository.findOne({
      entity: 'organization',
      where: { uuid: org.uuid }
    });
    if (!updated) throw new NotFoundException('Organización no encontrada');

    this.notifyOwnerValidationResult(updated as OrganizationEntity, 'rejected', trimmedReason).catch(
      err => {
        this.logger.error(`Failed to send org rejected email for ${organizationUuid}`, err?.stack);
      }
    );

    return updated as OrganizationEntity;
  }

  private async notifyOwnerValidationResult(
    org: OrganizationEntity,
    result: 'approved' | 'rejected',
    rejectionReason?: string
  ): Promise<void> {
    const membership = await this.dbRepository.findOne({
      entity: 'user_organization',
      where: { organizationUuid: org.uuid, isDeleted: IsNull() },
      relations: { user: true },
      other: { order: { createdAt: 'ASC' } }
    });

    const owner = membership?.user as
      | { firstName?: string; email?: string; lastName?: string }
      | undefined;
    const email = owner?.email?.trim() || org.contactEmail?.trim();
    if (!email) {
      this.logger.warn(`No email for organization ${org.uuid}; skip validation result mail`);
      return;
    }

    const firstName = owner?.firstName?.trim() || 'Productor';
    const organizationName = org.name || org.legalName || 'tu productora';

    if (result === 'approved') {
      await this.emailService.sendOrganizationApprovedEmail({
        firstName,
        email,
        organizationName
      });
      return;
    }

    await this.emailService.sendOrganizationRejectedEmail({
      firstName,
      email,
      organizationName,
      rejectionReason: rejectionReason || org.rejectionReason || 'Sin motivo indicado'
    });
  }
}
