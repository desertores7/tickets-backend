import { DBRepository } from '@config/db/db.repository';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IAuthService } from '@modules/auth/services/contracts/iauth.service';
import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { ISearchParams } from '@root/shared/decorators/search-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { ILike, DataSource, IsNull, In, Not } from 'typeorm';
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
import { FileEntity } from '@config/db/entities/user/file.entity';
import { UserPermissionService } from '@root/shared/services/userPermissions.service';
import { UpdateOrganizationMeRequest } from '../../controllers/dtos/organization-me/update-organization-me.request';
import {
  ORGANIZATION_FISCAL_DOC_MAX_FILES,
  ORGANIZATION_FISCAL_MIN_DOCS,
  ORGANIZATION_FISCAL_REQUIRED_KINDS,
  ORGANIZATION_STATUS,
  ORGANIZATION_STATUS_UUID_BY_NAME,
  isValidCbu,
  normalizeCbuDigits,
  organizationStatusName,
  type OrganizationFiscalDocumentKind,
  type OrganizationValidationStatus
} from '@modules/organization/const/organization-fiscal.const';
import { RequestBankChangeRequest } from '../../controllers/dtos/organization-me/request-bank-change.request';
import {
  ORGANIZATION_FISCAL_FILE_TYPE_UUID_BY_KIND,
  ORGANIZATION_FISCAL_FILE_TYPE_UUIDS,
  ORGANIZATION_FISCAL_KIND_BY_FILE_TYPE_UUID
} from '@config/db/const/file-type.const';
import { organizationFilters } from '../../controllers/const/organization.filters';
import { IFiltersParams } from '@root/shared/decorators/filter-query.decorator';
import { EmailService } from '@root/shared/auth/services/email.service';
import { StorageService } from '@root/shared/services/storage.service';
import { IUserNotificationService } from '@modules/notifications/services/contracts/iuser-notification.service';
import {
  parseFiscalDocumentKindOptional,
  validateFiscalUploadFile
} from '@modules/organization/utils/fiscal-document-file.util';

export type TOrganizationFilters = IFiltersParams<typeof organizationFilters>;

@Injectable()
export class OrganizationService implements IOrganizationService {
  private readonly logger = new Logger(OrganizationService.name);

  constructor(
    @Inject(DBRepository) private dbRepository: DBRepository,
    @Inject('IAuthService') private readonly authService: IAuthService,
    private readonly user: UserPermissionService,
    private readonly emailService: EmailService,
    private readonly storageService: StorageService,
    @Inject('IUserNotificationService')
    private readonly userNotificationService: IUserNotificationService,
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
      const statusUuids = filters.validationStatus
        .map(name => ORGANIZATION_STATUS_UUID_BY_NAME[name as OrganizationValidationStatus])
        .filter(Boolean);
      if (statusUuids.length) {
        baseWhere.organizationStatusUuid =
          statusUuids.length === 1 ? statusUuids[0] : In(statusUuids);
      }
    }

    if (filters?.bankChangePending?.includes('true')) {
      baseWhere.bankChangeRequestedAt = Not(IsNull());
    } else if (filters?.bankChangePending?.includes('false')) {
      baseWhere.bankChangeRequestedAt = IsNull();
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
      ? [
          { ...baseWhere, name: ILike(`%${searchTerm}%`) },
          { ...baseWhere, legalName: ILike(`%${searchTerm}%`) },
          { ...baseWhere, taxId: ILike(`%${searchTerm}%`) }
        ]
      : baseWhere;

    let finalWhere: any = searchWhere;
    if (filteredOrganizationUuids) {
      if (searchTerm) {
        finalWhere = [
          { uuid: In(filteredOrganizationUuids), ...baseWhere, name: ILike(`%${searchTerm}%`) },
          {
            uuid: In(filteredOrganizationUuids),
            ...baseWhere,
            legalName: ILike(`%${searchTerm}%`)
          },
          { uuid: In(filteredOrganizationUuids), ...baseWhere, taxId: ILike(`%${searchTerm}%`) }
        ];
      } else {
        finalWhere = { uuid: In(filteredOrganizationUuids), ...baseWhere };
      }
    }

    const organization = await this.dbRepository.findManyAndCount({
      entity: 'organization',
      where: finalWhere,
      relations: {
        userOrganizations: { user: true },
        organizationStatus: true
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
    organization.organizationStatusUuid = ORGANIZATION_STATUS.DRAFT_INCOMPLETE.uuid;
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
      relations: {
        userOrganizations: { user: { userRoles: { role: true } } },
        organizationStatus: true
      }
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
      relations: { organization: { organizationStatus: true } },
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
    const status = organizationStatusName(org);

    const identityKeys = [
      'name',
      'legalName',
      'taxId',
      'taxCondition',
      'contactEmail'
    ] as const;
    const bankKeys = ['bankName', 'cbu', 'bankAlias'] as const;
    const socialKeys = [
      'website',
      'instagram',
      'tiktok',
      'facebook',
      'socialX',
      'contactPhone'
    ] as const;

    const touchesIdentity = identityKeys.some(k => data[k] !== undefined);
    const touchesBank = bankKeys.some(k => data[k] !== undefined);
    const touchesSocial = socialKeys.some(k => data[k] !== undefined);
    const touchesFiscal = touchesIdentity || touchesBank;

    if (status === 'pending_review' && touchesFiscal) {
      throw new BadRequestException(
        'La solicitud está en revisión. No se pueden editar los datos fiscales ni bancarios hasta la resolución.'
      );
    }

    if (status === 'approved' && touchesIdentity) {
      throw new BadRequestException(
        'Los datos fiscales quedaron bloqueados tras la validación. Si necesitás un cambio excepcional, contactá soporte.'
      );
    }

    if (status === 'approved' && touchesBank) {
      throw new BadRequestException(
        'Para cambiar banco, CBU o alias usá “Solicitar cambio de cuenta”.'
      );
    }

    if (!touchesFiscal && !touchesSocial) {
      return org;
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

    if (data.cbu !== undefined) {
      const normalizedCbu = normalizeCbuDigits(data.cbu);
      if (!isValidCbu(normalizedCbu)) {
        throw new BadRequestException('CBU inválido: deben ser 22 dígitos');
      }
      data = { ...data, cbu: normalizedCbu };
    }

    const patch: Partial<OrganizationEntity> = { updatedBy: userUuid };
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.legalName !== undefined) patch.legalName = data.legalName.trim();
    if (data.taxId !== undefined) patch.taxId = data.taxId;
    if (data.taxCondition !== undefined) patch.taxCondition = data.taxCondition;
    if (data.contactPhone !== undefined) patch.contactPhone = data.contactPhone.trim() || null;
    if (data.contactEmail !== undefined) patch.contactEmail = data.contactEmail.trim();
    if (data.bankName !== undefined) patch.bankName = data.bankName.trim();
    if (data.cbu !== undefined) patch.cbu = data.cbu;
    if (data.bankAlias !== undefined) patch.bankAlias = data.bankAlias.trim();
    if (data.website !== undefined) patch.website = data.website.trim() || null;
    if (data.instagram !== undefined) patch.instagram = data.instagram.trim() || null;
    if (data.tiktok !== undefined) patch.tiktok = data.tiktok.trim() || null;
    if (data.facebook !== undefined) patch.facebook = data.facebook.trim() || null;
    if (data.socialX !== undefined) patch.socialX = data.socialX.trim() || null;

    // Rechazada → vuelve a borrador al tocar fiscal/banco (sin borrar datos).
    if (touchesFiscal && status === 'rejected') {
      patch.organizationStatusUuid = ORGANIZATION_STATUS.DRAFT_INCOMPLETE.uuid;
      patch.rejectionReason = null;
    }

    await this.dbRepository.update({
      entity: 'organization',
      where: { uuid: org.uuid },
      data: patch
    });

    return this.resolveMembershipOrganization(userUuid);
  }

  async requestBankAccountChange(
    userUuid: string,
    data: RequestBankChangeRequest
  ): Promise<OrganizationEntity> {
    const org = await this.resolveMembershipOrganization(userUuid);
    const status = organizationStatusName(org);

    if (status !== 'approved') {
      throw new BadRequestException(
        'Solo productoras aprobadas pueden solicitar un cambio de cuenta bancaria.'
      );
    }

    if (org.bankChangeRequestedAt) {
      throw new BadRequestException(
        'Ya hay un cambio de cuenta en revisión. Esperá la resolución del administrador.'
      );
    }

    const bankName = data.bankName.trim();
    const bankAlias = data.bankAlias.trim();
    const cbu = normalizeCbuDigits(data.cbu);

    if (bankName.length < 2) {
      throw new BadRequestException('Indicá el nombre del banco');
    }
    if (!isValidCbu(cbu)) {
      throw new BadRequestException('CBU inválido: deben ser 22 dígitos');
    }
    if (!bankAlias) {
      throw new BadRequestException('Indicá el alias CBU');
    }

    const sameAsCurrent =
      (org.bankName ?? '').trim().toLowerCase() === bankName.toLowerCase() &&
      (org.cbu ?? '') === cbu &&
      (org.bankAlias ?? '').trim().toLowerCase() === bankAlias.toLowerCase();
    if (sameAsCurrent) {
      throw new BadRequestException('Los datos bancarios son iguales a los actuales');
    }

    await this.dbRepository.update({
      entity: 'organization',
      where: { uuid: org.uuid },
      data: {
        pendingBankName: bankName,
        pendingCbu: cbu,
        pendingBankAlias: bankAlias,
        bankChangeRequestedAt: new Date(),
        bankChangeRejectionReason: null,
        updatedBy: userUuid
      }
    });

    const updated = await this.resolveMembershipOrganization(userUuid);
    this.notifyOwnerBankChangeSubmitted(updated, userUuid).catch(err => {
      this.logger.error(`Failed to notify bank change submitted for ${org.uuid}`, err?.stack);
    });

    return updated;
  }

  async approveBankAccountChange(
    organizationUuid: string,
    adminUuid: string
  ): Promise<OrganizationEntity> {
    const org = await this.dbRepository.findOne({
      entity: 'organization',
      where: { uuid: organizationUuid, isDeleted: IsNull() },
      relations: { organizationStatus: true }
    });
    if (!org) throw new NotFoundException('Organización no encontrada');
    if (!org.bankChangeRequestedAt || !org.pendingCbu) {
      throw new BadRequestException('No hay un cambio de cuenta pendiente');
    }

    await this.dbRepository.update({
      entity: 'organization',
      where: { uuid: org.uuid },
      data: {
        bankName: org.pendingBankName,
        cbu: org.pendingCbu,
        bankAlias: org.pendingBankAlias,
        pendingBankName: null,
        pendingCbu: null,
        pendingBankAlias: null,
        bankChangeRequestedAt: null,
        bankChangeRejectionReason: null,
        updatedBy: adminUuid
      }
    });

    const updated = await this.dbRepository.findOne({
      entity: 'organization',
      where: { uuid: org.uuid },
      relations: { organizationStatus: true }
    });
    if (!updated) throw new NotFoundException('Organización no encontrada');

    this.notifyOwnerBankChangeResult(updated as OrganizationEntity, 'approved').catch(err => {
      this.logger.error(`Failed to notify bank change approved for ${organizationUuid}`, err?.stack);
    });

    return updated as OrganizationEntity;
  }

  async rejectBankAccountChange(
    organizationUuid: string,
    adminUuid: string,
    reason: string
  ): Promise<OrganizationEntity> {
    const org = await this.dbRepository.findOne({
      entity: 'organization',
      where: { uuid: organizationUuid, isDeleted: IsNull() },
      relations: { organizationStatus: true }
    });
    if (!org) throw new NotFoundException('Organización no encontrada');
    if (!org.bankChangeRequestedAt) {
      throw new BadRequestException('No hay un cambio de cuenta pendiente');
    }

    const trimmedReason = reason.trim();
    if (trimmedReason.length < 3) {
      throw new BadRequestException('Indicá un motivo de rechazo');
    }

    await this.dbRepository.update({
      entity: 'organization',
      where: { uuid: org.uuid },
      data: {
        pendingBankName: null,
        pendingCbu: null,
        pendingBankAlias: null,
        bankChangeRequestedAt: null,
        bankChangeRejectionReason: trimmedReason,
        updatedBy: adminUuid
      }
    });

    const updated = await this.dbRepository.findOne({
      entity: 'organization',
      where: { uuid: org.uuid },
      relations: { organizationStatus: true }
    });
    if (!updated) throw new NotFoundException('Organización no encontrada');

    this.notifyOwnerBankChangeResult(updated as OrganizationEntity, 'rejected', trimmedReason).catch(
      err => {
        this.logger.error(
          `Failed to notify bank change rejected for ${organizationUuid}`,
          err?.stack
        );
      }
    );

    return updated as OrganizationEntity;
  }

  async submitMyOrganizationValidation(userUuid: string): Promise<OrganizationEntity> {
    const org = await this.resolveMembershipOrganization(userUuid);
    const status = organizationStatusName(org);

    if (status === 'pending_review') {
      throw new BadRequestException('La solicitud ya está en revisión');
    }
    if (status === 'approved') {
      throw new BadRequestException('La productora ya está aprobada');
    }

    const missing: string[] = [];
    if (!org.legalName?.trim()) missing.push('razón social');
    if (!org.taxId?.trim()) missing.push('CUIT/CUIL');
    if (!org.taxCondition) missing.push('condición fiscal');
    if (!org.contactEmail?.trim()) missing.push('email de contacto');
    if (!org.bankName?.trim()) missing.push('banco');
    if (!org.cbu?.trim() || !isValidCbu(org.cbu)) missing.push('CBU (22 dígitos)');
    if (!org.bankAlias?.trim()) missing.push('alias');

    if (missing.length) {
      throw new BadRequestException(`Completá: ${missing.join(', ')}`);
    }

    const docs = await this.listActiveFiscalDocuments(org.uuid);
    if (docs.length < ORGANIZATION_FISCAL_MIN_DOCS) {
      throw new BadRequestException('Subí al menos un documento de respaldo');
    }

    await this.dbRepository.update({
      entity: 'organization',
      where: { uuid: org.uuid },
      data: {
        organizationStatusUuid: ORGANIZATION_STATUS.PENDING_REVIEW.uuid,
        validationSubmittedAt: new Date(),
        rejectionReason: null,
        updatedBy: userUuid
      }
    });

    const updated = await this.resolveMembershipOrganization(userUuid);
    this.notifyOwnerValidationSubmitted(updated, userUuid).catch(err => {
      this.logger.error(`Failed to notify org submitted for ${org.uuid}`, err?.stack);
    });

    return updated;
  }

  async listMyFiscalDocuments(userUuid: string): Promise<FileEntity[]> {
    const org = await this.resolveMembershipOrganization(userUuid);
    return this.listActiveFiscalDocuments(org.uuid);
  }

  async uploadMyFiscalDocument(
    userUuid: string,
    file: Express.Multer.File,
    documentKindRaw: unknown
  ): Promise<FileEntity> {
    const org = await this.resolveMembershipOrganization(userUuid);
    this.assertFiscalDocsEditable(org);

    const validated = validateFiscalUploadFile(file);
    const existing = await this.listActiveFiscalDocuments(org.uuid);
    if (existing.length >= ORGANIZATION_FISCAL_DOC_MAX_FILES) {
      throw new BadRequestException(`Máximo ${ORGANIZATION_FISCAL_DOC_MAX_FILES} archivos por productora`);
    }

    const documentKind =
      parseFiscalDocumentKindOptional(documentKindRaw) ??
      this.nextAutoFiscalDocumentKind(
        existing.map(d => ORGANIZATION_FISCAL_KIND_BY_FILE_TYPE_UUID[d.fileTypeUuid] ?? 'other')
      );

    const storedName = `${uuidv4()}.${validated.ext}`;
    const relativePath = `private/organizations/${org.uuid}/fiscal`;

    await this.storageService.savePrivateFile({
      buffer: validated.buffer,
      relativePath,
      filename: storedName
    });

    const entity = new FileEntity();
    entity.uuid = uuidv4();
    entity.userUuid = null;
    entity.organizationUuid = org.uuid;
    entity.path = null;
    entity.type = validated.mimeType;
    entity.fileTypeUuid = ORGANIZATION_FISCAL_FILE_TYPE_UUID_BY_KIND[documentKind];
    entity.originalName = validated.originalName;
    entity.storedName = storedName;
    entity.sizeBytes = validated.sizeBytes;
    entity.relativePath = relativePath;
    entity.isDeleted = null;
    entity.createdBy = userUuid;
    entity.updatedBy = userUuid;
    entity.createdAt = new Date();
    entity.updatedAt = new Date();

    await this.dbRepository.create({
      entity: 'file',
      data: entity
    });

    await this.markOrgDirtyAfterDocChange(org, userUuid);

    return entity;
  }

  async deleteMyFiscalDocument(userUuid: string, documentUuid: string): Promise<void> {
    const org = await this.resolveMembershipOrganization(userUuid);
    this.assertFiscalDocsEditable(org);

    const doc = await this.findActiveDoc(org.uuid, documentUuid);
    if (!doc) throw new NotFoundException('Documento no encontrado');
    if (!doc.relativePath || !doc.storedName) {
      throw new NotFoundException('Documento no encontrado');
    }

    const absolutePath = this.storageService.resolveAbsolutePath(doc.relativePath, doc.storedName);
    await this.storageService.deleteFile(absolutePath);

    await this.dbRepository.update({
      entity: 'file',
      where: { uuid: doc.uuid },
      data: { isDeleted: new Date(), updatedBy: userUuid }
    });

    await this.markOrgDirtyAfterDocChange(org, userUuid);
  }

  async getMyFiscalDocumentDownload(
    userUuid: string,
    documentUuid: string
  ): Promise<{ absolutePath: string; mimeType: string; originalName: string }> {
    const org = await this.resolveMembershipOrganization(userUuid);
    return this.resolveFiscalDownload(org.uuid, documentUuid);
  }

  async listOrganizationFiscalDocuments(organizationUuid: string): Promise<FileEntity[]> {
    const org = await this.dbRepository.findOne({
      entity: 'organization',
      where: { uuid: organizationUuid, isDeleted: IsNull() }
    });
    if (!org) throw new NotFoundException('Organización no encontrada');
    return this.listActiveFiscalDocuments(organizationUuid);
  }

  async getOrganizationFiscalDocumentDownload(
    organizationUuid: string,
    documentUuid: string
  ): Promise<{ absolutePath: string; mimeType: string; originalName: string }> {
    const org = await this.dbRepository.findOne({
      entity: 'organization',
      where: { uuid: organizationUuid, isDeleted: IsNull() }
    });
    if (!org) throw new NotFoundException('Organización no encontrada');
    return this.resolveFiscalDownload(organizationUuid, documentUuid);
  }

  private assertFiscalDocsEditable(org: OrganizationEntity): void {
    const status = organizationStatusName(org);
    if (status === 'pending_review') {
      throw new BadRequestException(
        'La solicitud está en revisión. No se pueden modificar documentos hasta la resolución.'
      );
    }
    if (status === 'approved') {
      throw new BadRequestException(
        'Los documentos fiscales quedaron bloqueados tras la validación.'
      );
    }
  }

  /** Completa el pack mínimo en orden; extras → other. */
  private nextAutoFiscalDocumentKind(
    existingKinds: OrganizationFiscalDocumentKind[]
  ): OrganizationFiscalDocumentKind {
    const present = new Set(existingKinds);
    const nextRequired = ORGANIZATION_FISCAL_REQUIRED_KINDS.find(k => !present.has(k));
    return nextRequired ?? 'other';
  }

  private async markOrgDirtyAfterDocChange(org: OrganizationEntity, userUuid: string): Promise<void> {
    const status = organizationStatusName(org);
    if (status === 'rejected') {
      await this.dbRepository.update({
        entity: 'organization',
        where: { uuid: org.uuid },
        data: {
          organizationStatusUuid: ORGANIZATION_STATUS.DRAFT_INCOMPLETE.uuid,
          rejectionReason: null,
          updatedBy: userUuid
        }
      });
    }
  }

  private async listActiveFiscalDocuments(organizationUuid: string): Promise<FileEntity[]> {
    const docs = await this.dbRepository.findMany({
      entity: 'file',
      where: {
        organizationUuid,
        isDeleted: IsNull(),
        fileTypeUuid: In(ORGANIZATION_FISCAL_FILE_TYPE_UUIDS)
      },
      other: { order: { createdAt: 'ASC' } }
    });
    return docs as FileEntity[];
  }

  private async findActiveDoc(
    organizationUuid: string,
    documentUuid: string
  ): Promise<FileEntity | null> {
    return this.dbRepository.findOne({
      entity: 'file',
      where: {
        uuid: documentUuid,
        organizationUuid,
        isDeleted: IsNull(),
        fileTypeUuid: In(ORGANIZATION_FISCAL_FILE_TYPE_UUIDS)
      }
    }) as Promise<FileEntity | null>;
  }

  private async resolveFiscalDownload(
    organizationUuid: string,
    documentUuid: string
  ): Promise<{ absolutePath: string; mimeType: string; originalName: string }> {
    const doc = await this.findActiveDoc(organizationUuid, documentUuid);
    if (!doc?.relativePath || !doc.storedName) {
      throw new NotFoundException('Documento no encontrado');
    }

    const absolutePath = this.storageService.resolveAbsolutePath(doc.relativePath, doc.storedName);
    const exists = await this.storageService.fileExists(absolutePath);
    if (!exists) {
      this.logger.error(`Fiscal document missing on disk: ${doc.uuid}`);
      throw new NotFoundException('Documento no encontrado');
    }

    return {
      absolutePath,
      mimeType: doc.type,
      originalName: doc.originalName || 'documento'
    };
  }

  async approveOrganization(organizationUuid: string, adminUuid: string): Promise<OrganizationEntity> {
    const org = await this.dbRepository.findOne({
      entity: 'organization',
      where: { uuid: organizationUuid, isDeleted: IsNull() },
      relations: { organizationStatus: true }
    });
    if (!org) throw new NotFoundException('Organización no encontrada');
    if (organizationStatusName(org) !== 'pending_review') {
      throw new BadRequestException('Solo se pueden aprobar solicitudes en revisión');
    }

    await this.dbRepository.update({
      entity: 'organization',
      where: { uuid: org.uuid },
      data: {
        organizationStatusUuid: ORGANIZATION_STATUS.APPROVED.uuid,
        validationResolvedAt: new Date(),
        rejectionReason: null,
        updatedBy: adminUuid
      }
    });

    const updated = await this.dbRepository.findOne({
      entity: 'organization',
      where: { uuid: org.uuid },
      relations: { organizationStatus: true }
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
      where: { uuid: organizationUuid, isDeleted: IsNull() },
      relations: { organizationStatus: true }
    });
    if (!org) throw new NotFoundException('Organización no encontrada');
    if (organizationStatusName(org) !== 'pending_review') {
      throw new BadRequestException('Solo se pueden rechazar solicitudes en revisión');
    }

    const trimmedReason = reason.trim();

    await this.dbRepository.update({
      entity: 'organization',
      where: { uuid: org.uuid },
      data: {
        organizationStatusUuid: ORGANIZATION_STATUS.REJECTED.uuid,
        validationResolvedAt: new Date(),
        rejectionReason: trimmedReason,
        updatedBy: adminUuid
      }
    });

    const updated = await this.dbRepository.findOne({
      entity: 'organization',
      where: { uuid: org.uuid },
      relations: { organizationStatus: true }
    });
    if (!updated) throw new NotFoundException('Organización no encontrada');

    this.notifyOwnerValidationResult(updated as OrganizationEntity, 'rejected', trimmedReason).catch(
      err => {
        this.logger.error(`Failed to send org rejected email for ${organizationUuid}`, err?.stack);
      }
    );

    return updated as OrganizationEntity;
  }

  private async notifyOwnerValidationSubmitted(
    org: OrganizationEntity,
    ownerUserUuid: string
  ): Promise<void> {
    const membership = await this.dbRepository.findOne({
      entity: 'user_organization',
      where: { organizationUuid: org.uuid, userUuid: ownerUserUuid, isDeleted: IsNull() },
      relations: { user: true }
    });

    const owner = membership?.user as
      | { uuid?: string; firstName?: string; email?: string }
      | undefined;
    const organizationName = org.name || org.legalName || 'tu productora';
    const firstName = owner?.firstName?.trim() || 'Productor';
    const email = owner?.email?.trim() || org.contactEmail?.trim();

    await this.userNotificationService.create(
      ownerUserUuid,
      'Solicitud de productora enviada',
      `Recibimos los datos fiscales de ${organizationName}. En las próximas horas vas a recibir una confirmación cuando un administrador revise la solicitud.`
    );

    if (!email) {
      this.logger.warn(`No email for organization ${org.uuid}; skip submitted mail`);
      return;
    }

    await this.emailService.sendOrganizationSubmittedEmail({
      firstName,
      email,
      organizationName
    });
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
      | { uuid?: string; firstName?: string; email?: string; lastName?: string }
      | undefined;
    const email = owner?.email?.trim() || org.contactEmail?.trim();
    const firstName = owner?.firstName?.trim() || 'Productor';
    const organizationName = org.name || org.legalName || 'tu productora';
    const ownerUuid = owner?.uuid;

    if (ownerUuid) {
      if (result === 'approved') {
        await this.userNotificationService.create(
          ownerUuid,
          'Productora aprobada',
          `Los datos fiscales de ${organizationName} fueron validados correctamente. Ya podés crear eventos y operar en la plataforma.`
        );
      } else {
        const reason = rejectionReason || org.rejectionReason || 'Sin motivo indicado';
        await this.userNotificationService.create(
          ownerUuid,
          'Validación de productora rechazada',
          `La solicitud de ${organizationName} fue rechazada. Motivo: ${reason}. Corregí los datos fiscales y volvé a enviar.`
        );
      }
    }

    if (!email) {
      this.logger.warn(`No email for organization ${org.uuid}; skip validation result mail`);
      return;
    }

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

  private async notifyOwnerBankChangeSubmitted(
    org: OrganizationEntity,
    ownerUserUuid: string
  ): Promise<void> {
    const organizationName = org.name || org.legalName || 'tu productora';
    await this.userNotificationService.create(
      ownerUserUuid,
      'Cambio de cuenta enviado',
      `Recibimos la solicitud de cambio de datos bancarios de ${organizationName}. Seguís operando con normalidad mientras un administrador la revisa.`
    );
  }

  private async notifyOwnerBankChangeResult(
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

    const owner = membership?.user as { uuid?: string } | undefined;
    const ownerUuid = owner?.uuid;
    if (!ownerUuid) return;

    const organizationName = org.name || org.legalName || 'tu productora';
    if (result === 'approved') {
      await this.userNotificationService.create(
        ownerUuid,
        'Cambio de cuenta aprobado',
        `Actualizamos los datos bancarios de ${organizationName}. Banco: ${org.bankName ?? '—'}, CBU: ${org.cbu ?? '—'}, Alias: ${org.bankAlias ?? '—'}.`
      );
      return;
    }

    const reason = rejectionReason || org.bankChangeRejectionReason || 'Sin motivo indicado';
    await this.userNotificationService.create(
      ownerUuid,
      'Cambio de cuenta rechazado',
      `No pudimos aprobar el cambio de cuenta de ${organizationName}. Motivo: ${reason}. Los datos bancarios actuales se mantienen.`
    );
  }
}
