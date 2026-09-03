import { DBRepository } from '@config/db/db.repository';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IAuthService } from '@modules/auth/services/contracts/iauth.service';
import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { ISearchParams } from '@root/shared/decorators/search-query.decorator';
import { IOrderParams, resolveListOrder } from '@root/shared/decorators/order-query.decorator';
import { ORGANIZATION_ORDER_COLUMNS } from '../../controllers/const/organization.filters';
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
import { OrganizationRequestEntity } from '@config/db/entities/user/organization_request.entity';
import { UserOrganizationEntity } from '@config/db/entities/user/user_organization.entity';
import { FileEntity } from '@config/db/entities/user/file.entity';
import { UserPermissionService } from '@root/shared/services/userPermissions.service';
import { UpdateOrganizationMeRequest } from '../../controllers/dtos/organization-me/update-organization-me.request';
import type { OrgRequestView } from '../../controllers/dtos/organization-me/organization-me.response';
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
import {
  isBankChangePayload,
  isFiscalChangePayload,
  type OrganizationRequestPayload,
  type OrganizationRequestStatus,
  type OrganizationRequestType
} from '@modules/organization/const/organization-request.const';
import { RequestBankChangeRequest } from '../../controllers/dtos/organization-me/request-bank-change.request';
import { RequestFiscalChangeRequest } from '../../controllers/dtos/organization-me/request-fiscal-change.request';
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
    filters?: TOrganizationFilters,
    order?: IOrderParams<typeof ORGANIZATION_ORDER_COLUMNS>
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

    let mustIncludeUuids: string[] | null = null;
    const mustExcludeUuids = new Set<string>();

    if (filters?.bankChangePending?.includes('true')) {
      const pending = await this.listPendingRequestOrgUuids('bank_change');
      mustIncludeUuids = pending;
    } else if (filters?.bankChangePending?.includes('false')) {
      for (const uuid of await this.listPendingRequestOrgUuids('bank_change')) {
        mustExcludeUuids.add(uuid);
      }
    }

    if (filters?.fiscalChangePending?.includes('true')) {
      const pending = await this.listPendingRequestOrgUuids('fiscal_change');
      mustIncludeUuids =
        mustIncludeUuids === null
          ? pending
          : mustIncludeUuids.filter(uuid => pending.includes(uuid));
    } else if (filters?.fiscalChangePending?.includes('false')) {
      for (const uuid of await this.listPendingRequestOrgUuids('fiscal_change')) {
        mustExcludeUuids.add(uuid);
      }
    }

    if (mustIncludeUuids !== null && mustIncludeUuids.length === 0) {
      return {
        meta: new PaginationMetaResponse({
          limit: pagination.limit,
          page: pagination.page,
          total: 0
        }),
        items: []
      };
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

    if (mustIncludeUuids !== null) {
      filteredOrganizationUuids =
        filteredOrganizationUuids === null
          ? mustIncludeUuids
          : filteredOrganizationUuids.filter(uuid => mustIncludeUuids!.includes(uuid));
    }

    if (mustExcludeUuids.size > 0) {
      if (filteredOrganizationUuids !== null) {
        filteredOrganizationUuids = filteredOrganizationUuids.filter(
          uuid => !mustExcludeUuids.has(uuid)
        );
      } else {
        baseWhere.uuid = Not(In([...mustExcludeUuids]));
      }
    }

    if (filteredOrganizationUuids !== null && filteredOrganizationUuids.length === 0) {
      return {
        meta: new PaginationMetaResponse({
          limit: pagination.limit,
          page: pagination.page,
          total: 0
        }),
        items: []
      };
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
          { ...baseWhere, uuid: In(filteredOrganizationUuids), name: ILike(`%${searchTerm}%`) },
          {
            ...baseWhere,
            uuid: In(filteredOrganizationUuids),
            legalName: ILike(`%${searchTerm}%`)
          },
          { ...baseWhere, uuid: In(filteredOrganizationUuids), taxId: ILike(`%${searchTerm}%`) }
        ];
      } else {
        finalWhere = { ...baseWhere, uuid: In(filteredOrganizationUuids) };
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
        order: resolveListOrder(order, ORGANIZATION_ORDER_COLUMNS, { createdAt: 'DESC' })
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

  private async findPendingRequest(
    organizationUuid: string,
    type: OrganizationRequestType
  ): Promise<OrganizationRequestEntity | null> {
    const request = await this.dbRepository.findOne({
      entity: 'organization_request',
      where: {
        organizationUuid,
        type,
        status: 'pending',
        isDeleted: IsNull()
      },
      other: { order: { createdAt: 'DESC' } }
    });
    return (request as OrganizationRequestEntity | null) ?? null;
  }

  private async findLatestRejectedRequest(
    organizationUuid: string,
    type: OrganizationRequestType
  ): Promise<OrganizationRequestEntity | null> {
    const request = await this.dbRepository.findOne({
      entity: 'organization_request',
      where: {
        organizationUuid,
        type,
        status: 'rejected',
        isDeleted: IsNull()
      },
      other: { order: { resolvedAt: 'DESC', createdAt: 'DESC' } }
    });
    return (request as OrganizationRequestEntity | null) ?? null;
  }

  private async createPendingRequest(
    organizationUuid: string,
    type: OrganizationRequestType,
    payload: OrganizationRequestPayload,
    userUuid: string
  ): Promise<OrganizationRequestEntity> {
    const entity = new OrganizationRequestEntity();
    entity.uuid = uuidv4();
    entity.organizationUuid = organizationUuid;
    entity.type = type;
    entity.status = 'pending';
    entity.payload = payload;
    entity.rejectionReason = null;
    entity.resolvedAt = null;
    entity.resolvedByUuid = null;
    entity.isDeleted = null;
    entity.createdBy = userUuid;
    entity.updatedBy = userUuid;
    entity.createdAt = new Date();
    entity.updatedAt = new Date();

    await this.dbRepository.create({
      entity: 'organization_request',
      data: entity
    });

    return entity;
  }

  private async resolvePendingRequest(
    request: OrganizationRequestEntity,
    status: Extract<OrganizationRequestStatus, 'approved' | 'rejected'>,
    adminUuid: string,
    rejectionReason?: string
  ): Promise<void> {
    await this.dbRepository.update({
      entity: 'organization_request',
      where: { uuid: request.uuid },
      data: {
        status,
        rejectionReason: status === 'rejected' ? (rejectionReason ?? null) : null,
        resolvedAt: new Date(),
        resolvedByUuid: adminUuid,
        updatedBy: adminUuid
      }
    });
  }

  private async listPendingRequestOrgUuids(type: OrganizationRequestType): Promise<string[]> {
    const rows = await this.dbRepository.findMany({
      entity: 'organization_request',
      where: {
        type,
        status: 'pending',
        isDeleted: IsNull()
      },
      select: { organizationUuid: true } as any
    });
    return [...new Set((rows as Array<{ organizationUuid: string }>).map(r => r.organizationUuid))];
  }

  private async loadPendingRequestsForOrgs(
    orgUuids: string[]
  ): Promise<Map<string, { bank?: OrganizationRequestEntity; fiscal?: OrganizationRequestEntity }>> {
    const map = new Map<
      string,
      { bank?: OrganizationRequestEntity; fiscal?: OrganizationRequestEntity }
    >();
    if (!orgUuids.length) return map;

    const rows = (await this.dbRepository.findMany({
      entity: 'organization_request',
      where: {
        organizationUuid: In(orgUuids),
        status: 'pending',
        isDeleted: IsNull()
      },
      other: { order: { createdAt: 'DESC' } }
    })) as OrganizationRequestEntity[];

    for (const row of rows) {
      const entry = map.get(row.organizationUuid) ?? {};
      if (row.type === 'bank_change' && !entry.bank) entry.bank = row;
      if (row.type === 'fiscal_change' && !entry.fiscal) entry.fiscal = row;
      map.set(row.organizationUuid, entry);
    }

    return map;
  }

  private async enrichOrgWithRequests(organizationUuid: string): Promise<OrgRequestView> {
    const [pendingBank, pendingFiscal, lastRejectedBank, lastRejectedFiscal] = await Promise.all([
      this.findPendingRequest(organizationUuid, 'bank_change'),
      this.findPendingRequest(organizationUuid, 'fiscal_change'),
      this.findLatestRejectedRequest(organizationUuid, 'bank_change'),
      this.findLatestRejectedRequest(organizationUuid, 'fiscal_change')
    ]);

    return {
      pendingBank,
      pendingFiscal,
      lastRejectedBank,
      lastRejectedFiscal
    };
  }

  async getMyOrganization(userUuid: string): Promise<OrganizationEntity> {
    return this.resolveMembershipOrganization(userUuid);
  }

  async getOrgRequestView(organizationUuid: string): Promise<OrgRequestView> {
    return this.enrichOrgWithRequests(organizationUuid);
  }

  async getOrgRequestViews(organizationUuids: string[]): Promise<Map<string, OrgRequestView>> {
    const unique = [...new Set(organizationUuids.filter(Boolean))];
    const map = new Map<string, OrgRequestView>();
    if (!unique.length) return map;

    const pendingByOrg = await this.loadPendingRequestsForOrgs(unique);
    for (const orgUuid of unique) {
      const pending = pendingByOrg.get(orgUuid);
      map.set(orgUuid, {
        pendingBank: pending?.bank ?? null,
        pendingFiscal: pending?.fiscal ?? null
      });
    }
    return map;
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
        'Para cambiar datos fiscales usá “Solicitar cambio de información fiscal”.'
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

    const existingPending = await this.findPendingRequest(org.uuid, 'bank_change');
    if (existingPending) {
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

    await this.createPendingRequest(
      org.uuid,
      'bank_change',
      { bankName, cbu, bankAlias },
      userUuid
    );

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

    const pending = await this.findPendingRequest(org.uuid, 'bank_change');
    if (!pending || !isBankChangePayload(pending.type, pending.payload)) {
      throw new BadRequestException('No hay un cambio de cuenta pendiente');
    }

    const { bankName, cbu, bankAlias } = pending.payload;

    await this.dbRepository.update({
      entity: 'organization',
      where: { uuid: org.uuid },
      data: {
        bankName,
        cbu,
        bankAlias,
        updatedBy: adminUuid
      }
    });

    await this.resolvePendingRequest(pending, 'approved', adminUuid);

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

    const pending = await this.findPendingRequest(org.uuid, 'bank_change');
    if (!pending) {
      throw new BadRequestException('No hay un cambio de cuenta pendiente');
    }

    const trimmedReason = reason.trim();
    if (trimmedReason.length < 3) {
      throw new BadRequestException('Indicá un motivo de rechazo');
    }

    await this.resolvePendingRequest(pending, 'rejected', adminUuid, trimmedReason);

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

  async requestFiscalIdentityChange(
    userUuid: string,
    data: RequestFiscalChangeRequest,
    files: Express.Multer.File[] = []
  ): Promise<OrganizationEntity> {
    const org = await this.resolveMembershipOrganization(userUuid);
    const status = organizationStatusName(org);

    if (status !== 'approved') {
      throw new BadRequestException(
        'Solo productoras aprobadas pueden solicitar un cambio de información fiscal.'
      );
    }

    const existingPending = await this.findPendingRequest(org.uuid, 'fiscal_change');
    if (existingPending) {
      throw new BadRequestException(
        'Ya hay un cambio de información fiscal en revisión. Esperá la resolución del administrador.'
      );
    }

    const name = data.name.trim();
    const legalName = data.legalName.trim();
    const contactEmail = data.contactEmail.trim();
    const taxCondition = data.taxCondition;
    const normalizedTaxId = data.taxId.replace(/\D/g, '');

    if (name.length < 2) {
      throw new BadRequestException('Indicá el nombre comercial');
    }
    if (legalName.length < 2) {
      throw new BadRequestException('Indicá la razón social');
    }
    if (normalizedTaxId.length < 10 || normalizedTaxId.length > 11) {
      throw new BadRequestException('CUIT/CUIL inválido');
    }
    if (!contactEmail) {
      throw new BadRequestException('Indicá el email de contacto');
    }

    const duplicate = await this.dbRepository.findOne({
      entity: 'organization',
      where: { taxId: normalizedTaxId, isDeleted: IsNull(), uuid: Not(org.uuid) }
    });
    if (duplicate) {
      throw new BadRequestException('Ya existe una productora con ese CUIT/CUIL');
    }

    const deleteUuids = [...new Set(data.deleteDocumentUuids ?? [])];
    const existingDocs = await this.listActiveFiscalDocuments(org.uuid);
    const existingByUuid = new Map(existingDocs.map(doc => [doc.uuid, doc]));

    for (const documentUuid of deleteUuids) {
      if (!existingByUuid.has(documentUuid)) {
        throw new BadRequestException('Uno de los documentos a eliminar no existe');
      }
    }

    const remainingAfterDelete = existingDocs.length - deleteUuids.length;
    if (remainingAfterDelete + files.length > ORGANIZATION_FISCAL_DOC_MAX_FILES) {
      throw new BadRequestException(`Máximo ${ORGANIZATION_FISCAL_DOC_MAX_FILES} archivos por productora`);
    }
    if (remainingAfterDelete + files.length < ORGANIZATION_FISCAL_MIN_DOCS) {
      throw new BadRequestException('Dejá al menos un documento de respaldo');
    }

    const identityChanged =
      (org.name ?? '').trim() !== name ||
      (org.legalName ?? '').trim() !== legalName ||
      (org.taxId ?? '') !== normalizedTaxId ||
      (org.taxCondition ?? null) !== taxCondition ||
      (org.contactEmail ?? '').trim().toLowerCase() !== contactEmail.toLowerCase();

    const docsChanged = deleteUuids.length > 0 || files.length > 0;
    if (!identityChanged && !docsChanged) {
      throw new BadRequestException('No hay cambios para enviar');
    }

    for (const documentUuid of deleteUuids) {
      await this.deleteFiscalDocumentInternal(org.uuid, documentUuid, userUuid);
    }

    let docsAfterDelete = await this.listActiveFiscalDocuments(org.uuid);
    for (const file of files) {
      const created = await this.createFiscalDocumentInternal(org, userUuid, file, docsAfterDelete);
      docsAfterDelete = [...docsAfterDelete, created];
    }

    await this.createPendingRequest(
      org.uuid,
      'fiscal_change',
      {
        name,
        legalName,
        taxId: normalizedTaxId,
        taxCondition,
        contactEmail
      },
      userUuid
    );

    const updated = await this.resolveMembershipOrganization(userUuid);
    this.notifyOwnerFiscalChangeSubmitted(updated, userUuid).catch(err => {
      this.logger.error(`Failed to notify fiscal change submitted for ${org.uuid}`, err?.stack);
    });

    return updated;
  }

  async approveFiscalIdentityChange(
    organizationUuid: string,
    adminUuid: string
  ): Promise<OrganizationEntity> {
    const org = await this.dbRepository.findOne({
      entity: 'organization',
      where: { uuid: organizationUuid, isDeleted: IsNull() },
      relations: { organizationStatus: true }
    });
    if (!org) throw new NotFoundException('Organización no encontrada');

    const pending = await this.findPendingRequest(org.uuid, 'fiscal_change');
    if (!pending || !isFiscalChangePayload(pending.type, pending.payload)) {
      throw new BadRequestException('No hay un cambio de información fiscal pendiente');
    }

    const { name, legalName, taxId, taxCondition, contactEmail } = pending.payload;
    if (!legalName || !taxId) {
      throw new BadRequestException('No hay un cambio de información fiscal pendiente');
    }

    await this.dbRepository.update({
      entity: 'organization',
      where: { uuid: org.uuid },
      data: {
        name: name || org.name,
        legalName,
        taxId,
        taxCondition,
        contactEmail,
        updatedBy: adminUuid
      }
    });

    await this.resolvePendingRequest(pending, 'approved', adminUuid);

    const updated = await this.dbRepository.findOne({
      entity: 'organization',
      where: { uuid: org.uuid },
      relations: { organizationStatus: true }
    });
    if (!updated) throw new NotFoundException('Organización no encontrada');

    this.notifyOwnerFiscalChangeResult(updated as OrganizationEntity, 'approved').catch(err => {
      this.logger.error(`Failed to notify fiscal change approved for ${organizationUuid}`, err?.stack);
    });

    return updated as OrganizationEntity;
  }

  async rejectFiscalIdentityChange(
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

    const pending = await this.findPendingRequest(org.uuid, 'fiscal_change');
    if (!pending) {
      throw new BadRequestException('No hay un cambio de información fiscal pendiente');
    }

    const trimmedReason = reason.trim();
    if (trimmedReason.length < 3) {
      throw new BadRequestException('Indicá un motivo de rechazo');
    }

    await this.resolvePendingRequest(pending, 'rejected', adminUuid, trimmedReason);

    const updated = await this.dbRepository.findOne({
      entity: 'organization',
      where: { uuid: org.uuid },
      relations: { organizationStatus: true }
    });
    if (!updated) throw new NotFoundException('Organización no encontrada');

    this.notifyOwnerFiscalChangeResult(
      updated as OrganizationEntity,
      'rejected',
      trimmedReason
    ).catch(err => {
      this.logger.error(
        `Failed to notify fiscal change rejected for ${organizationUuid}`,
        err?.stack
      );
    });

    return updated as OrganizationEntity;
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
        'Para cambiar documentos usá “Solicitar cambio de información fiscal”.'
      );
    }
  }

  private async deleteFiscalDocumentInternal(
    organizationUuid: string,
    documentUuid: string,
    actorUuid: string
  ): Promise<void> {
    const doc = await this.findActiveDoc(organizationUuid, documentUuid);
    if (!doc) throw new NotFoundException('Documento no encontrado');
    if (!doc.relativePath || !doc.storedName) {
      throw new NotFoundException('Documento no encontrado');
    }

    const absolutePath = this.storageService.resolveAbsolutePath(doc.relativePath, doc.storedName);
    await this.storageService.deleteFile(absolutePath);

    await this.dbRepository.update({
      entity: 'file',
      where: { uuid: doc.uuid },
      data: { isDeleted: new Date(), updatedBy: actorUuid }
    });
  }

  private async createFiscalDocumentInternal(
    org: OrganizationEntity,
    userUuid: string,
    file: Express.Multer.File,
    existing: FileEntity[]
  ): Promise<FileEntity> {
    const validated = validateFiscalUploadFile(file);
    const documentKind =
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

    return entity;
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

  /**
   * Avisa a los administradores que hay algo esperando revision.
   *
   * Los admins se buscan por NOMBRE de rol y no por uuid a proposito: los uuid
   * de los seeds no coinciden entre entornos (el indice unico por nombre hace
   * que el ON DUPLICATE KEY UPDATE matchee por nombre), asi que un uuid fijo
   * funcionaria en local y en produccion notificaria a nadie.
   */
  private async notifyAdminsPendingReview(title: string, body: string): Promise<void> {
    const admins = await this.dataSource
      .createQueryBuilder()
      .select('DISTINCT ur.userUuid', 'userUuid')
      .from('user_role', 'ur')
      .innerJoin('role', 'r', 'r.uuid = ur.roleUuid')
      .innerJoin('user', 'u', 'u.uuid = ur.userUuid')
      .where('r.name = :roleName', { roleName: 'Administrador' })
      .andWhere('ur.isDeleted IS NULL')
      .andWhere('u.isDeleted IS NULL')
      .getRawMany<{ userUuid: string }>();

    if (!admins.length) {
      this.logger.warn('No hay administradores activos para notificar la revision pendiente');
      return;
    }

    // Una notificacion falla sin arrastrar a las demas: que un admin quede sin
    // aviso no puede impedir que el resto se entere.
    await Promise.allSettled(
      admins.map(a => this.userNotificationService.create(a.userUuid, title, body))
    );
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

    await this.notifyAdminsPendingReview(
      'Productora esperando revisión',
      `${organizationName} envió sus datos fiscales para validación. Revisala desde Productoras.`
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

    await this.notifyAdminsPendingReview(
      'Cambio de cuenta esperando revisión',
      `${organizationName} solicitó cambiar sus datos bancarios. Revisalo desde Productoras.`
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

    const reason = rejectionReason || 'Sin motivo indicado';
    await this.userNotificationService.create(
      ownerUuid,
      'Cambio de cuenta rechazado',
      `No pudimos aprobar el cambio de cuenta de ${organizationName}. Motivo: ${reason}. Los datos bancarios actuales se mantienen.`
    );
  }

  private async notifyOwnerFiscalChangeSubmitted(
    org: OrganizationEntity,
    ownerUserUuid: string
  ): Promise<void> {
    const organizationName = org.name || org.legalName || 'tu productora';
    await this.userNotificationService.create(
      ownerUserUuid,
      'Cambio fiscal enviado',
      `Recibimos la solicitud de cambio de información fiscal de ${organizationName}. Seguís operando con normalidad mientras un administrador la revisa.`
    );

    await this.notifyAdminsPendingReview(
      'Cambio fiscal esperando revisión',
      `${organizationName} solicitó cambiar su información fiscal. Revisalo desde Productoras.`
    );
  }

  private async notifyOwnerFiscalChangeResult(
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
        'Cambio fiscal aprobado',
        `Actualizamos la información fiscal de ${organizationName}.`
      );
      return;
    }

    const reason = rejectionReason || 'Sin motivo indicado';
    await this.userNotificationService.create(
      ownerUuid,
      'Cambio fiscal rechazado',
      `No pudimos aprobar el cambio de información fiscal de ${organizationName}. Motivo: ${reason}. Los datos vigentes se mantienen.`
    );
  }
}
