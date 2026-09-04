import { Injectable, NotFoundException } from '@nestjs/common';
import { IsNull, Like } from 'typeorm';
import { DBRepository } from '@config/db/db.repository';
import { MpCatalogItemEntity } from '@config/db/entities/tickets/mp_catalog_item.entity';
import {
  MANUAL_ITEM_CATEGORIES,
  ManualItemCategory,
  OrgManualItemEntity
} from '@config/db/entities/tickets/org_manual_item.entity';
import { OrganizationEntity } from '@config/db/entities/user/organization.entity';
import { IOrderParams, resolveListOrder } from '@root/shared/decorators/order-query.decorator';
import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { ISearchParams } from '@root/shared/decorators/search-query.decorator';
import { IFiltersParams } from '@root/shared/decorators/filter-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { v4 as uuidv4 } from 'uuid';
import {
  MANUAL_ITEM_ORDER_COLUMNS,
  manualItemFilters
} from '../../controllers/const/manual-item.filters';
import {
  MP_CATALOG_ORDER_COLUMNS,
  mpCatalogFilters
} from '../../controllers/const/mp-catalog.filters';
import {
  IManualItem,
  IManualItemCategoryTotal,
  IManualItemPayload,
  IManualItemsListResult,
  IMpCatalogItem,
  IMpCatalogListResult,
  IOrgCatalogService
} from '../contracts/iorg-catalog.service';

@Injectable()
export class OrgCatalogService implements IOrgCatalogService {
  constructor(private readonly dbRepository: DBRepository) {}

  private async resolveOrganization(userUuid: string): Promise<OrganizationEntity> {
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

  private toManual(e: OrgManualItemEntity): IManualItem {
    return {
      uuid: e.uuid,
      name: e.name,
      // MySQL devuelve los decimal como string; se normaliza acá para que el
      // frontend no tenga que hacer Number() en cada campo.
      referencePrice: e.referencePrice === null ? null : Number(e.referencePrice),
      category: e.category,
      active: Boolean(e.active),
      createdAt: e.createdAt
    };
  }

  private toMp(
    i: MpCatalogItemEntity & { mpAccount?: { uuid: string; alias: string } }
  ): IMpCatalogItem {
    return {
      uuid: i.uuid,
      externalId: i.externalId,
      name: i.name,
      price: i.price === null ? null : Number(i.price),
      mpAccountUuid: i.orgMpAccountUuid,
      mpAccountAlias: i.mpAccount?.alias ?? '—',
      lastSyncAt: i.lastSyncAt
    };
  }

  async listMpCatalog(
    loggedUser: string,
    opts?: {
      pagination?: IPaginationParams;
      search?: ISearchParams;
      filters?: IFiltersParams<typeof mpCatalogFilters>;
      order?: IOrderParams<typeof MP_CATALOG_ORDER_COLUMNS>;
    }
  ): Promise<IMpCatalogListResult> {
    const org = await this.resolveOrganization(loggedUser);

    const page = Math.max(opts?.pagination?.page ?? 1, 1);
    const limit = opts?.pagination?.limit ?? 10;
    const accountUuid = opts?.filters?.accountUuid?.[0];
    const searchTerm = opts?.search?.search?.trim();

    const where: Record<string, unknown> = {
      organizationUuid: org.uuid,
      isDeleted: IsNull()
    };
    if (accountUuid) where.orgMpAccountUuid = accountUuid;
    if (searchTerm) where.name = Like(`%${searchTerm}%`);

    const result = await this.dbRepository.findManyAndCount({
      entity: 'mp_catalog_item',
      where: where as never,
      relations: { mpAccount: true },
      other: {
        take: limit,
        skip: (page - 1) * limit,
        order: {
          ...resolveListOrder(opts?.order, MP_CATALOG_ORDER_COLUMNS, { name: 'ASC' }),
          uuid: 'ASC'
        }
      }
    });

    const all = (await this.dbRepository.findMany({
      entity: 'mp_catalog_item',
      where: { organizationUuid: org.uuid, isDeleted: IsNull() },
      select: { uuid: true, lastSyncAt: true }
    })) as Pick<MpCatalogItemEntity, 'uuid' | 'lastSyncAt'>[];

    let lastSyncAt: Date | null = null;
    for (const row of all) {
      if (row.lastSyncAt && (!lastSyncAt || row.lastSyncAt > lastSyncAt)) {
        lastSyncAt = row.lastSyncAt;
      }
    }

    return {
      items: (
        result.items as (MpCatalogItemEntity & {
          mpAccount?: { uuid: string; alias: string };
        })[]
      ).map(i => this.toMp(i)),
      meta: new PaginationMetaResponse({ limit, page, total: result.count }),
      totalItems: all.length,
      lastSyncAt
    };
  }

  async listManualItems(
    loggedUser: string,
    opts?: {
      pagination?: IPaginationParams;
      search?: ISearchParams;
      filters?: IFiltersParams<typeof manualItemFilters>;
      order?: IOrderParams<typeof MANUAL_ITEM_ORDER_COLUMNS>;
      onlyActive?: boolean;
    }
  ): Promise<IManualItemsListResult> {
    const org = await this.resolveOrganization(loggedUser);

    const page = Math.max(opts?.pagination?.page ?? 1, 1);
    const limit = opts?.pagination?.limit ?? 10;
    const category = opts?.filters?.category?.[0] as ManualItemCategory | undefined;
    const activeRaw = opts?.filters?.active?.[0];
    const searchTerm = opts?.search?.search?.trim();

    // Compat: `?onlyActive=true` del picker de caja si no vino `active`.
    let activeFilter: boolean | undefined;
    if (activeRaw === 'true') activeFilter = true;
    else if (activeRaw === 'false') activeFilter = false;
    else if (opts?.onlyActive) activeFilter = true;

    const where: Record<string, unknown> = {
      organizationUuid: org.uuid,
      isDeleted: IsNull()
    };
    if (category) where.category = category;
    if (activeFilter !== undefined) where.active = activeFilter;
    if (searchTerm) where.name = Like(`%${searchTerm}%`);

    const result = await this.dbRepository.findManyAndCount({
      entity: 'org_manual_item',
      where: where as never,
      other: {
        take: limit,
        skip: (page - 1) * limit,
        order: {
          ...resolveListOrder(opts?.order, MANUAL_ITEM_ORDER_COLUMNS, { name: 'ASC' }),
          uuid: 'ASC'
        }
      }
    });

    const all = (await this.dbRepository.findMany({
      entity: 'org_manual_item',
      where: { organizationUuid: org.uuid, isDeleted: IsNull() },
      select: { uuid: true, category: true, active: true }
    })) as Pick<OrgManualItemEntity, 'uuid' | 'category' | 'active'>[];

    const categoryCounts = new Map<string, number>();
    let activeCount = 0;
    let inactiveCount = 0;
    for (const row of all) {
      if (row.active) activeCount += 1;
      else inactiveCount += 1;
      const key = row.category ?? 'sin_categoria';
      categoryCounts.set(key, (categoryCounts.get(key) ?? 0) + 1);
    }

    const byCategory: IManualItemCategoryTotal[] = [];
    for (const cat of MANUAL_ITEM_CATEGORIES) {
      const count = categoryCounts.get(cat) ?? 0;
      if (count > 0) byCategory.push({ category: cat, count });
    }
    const uncategorized = categoryCounts.get('sin_categoria') ?? 0;
    if (uncategorized > 0) {
      byCategory.push({ category: 'sin_categoria', count: uncategorized });
    }

    return {
      items: (result.items as OrgManualItemEntity[]).map(i => this.toManual(i)),
      meta: new PaginationMetaResponse({ limit, page, total: result.count }),
      totalItems: all.length,
      activeCount,
      inactiveCount,
      byCategory
    };
  }

  async createManualItem(loggedUser: string, payload: IManualItemPayload): Promise<IManualItem> {
    const org = await this.resolveOrganization(loggedUser);

    const item = new OrgManualItemEntity();
    item.uuid = uuidv4();
    item.organizationUuid = org.uuid;
    item.name = payload.name.trim();
    item.referencePrice = payload.referencePrice ?? null;
    item.category = payload.category ?? null;
    item.active = payload.active ?? true;
    item.isDeleted = null;

    await this.dbRepository.create({ entity: 'org_manual_item', data: item });
    return this.toManual(item);
  }

  async updateManualItem(
    loggedUser: string,
    itemUuid: string,
    payload: Partial<IManualItemPayload>
  ): Promise<IManualItem> {
    const item = await this.requireOwnItem(loggedUser, itemUuid);

    const data: Partial<OrgManualItemEntity> = {};
    if (payload.name !== undefined) data.name = payload.name.trim();
    if (payload.referencePrice !== undefined) data.referencePrice = payload.referencePrice;
    if (payload.category !== undefined) data.category = payload.category;
    if (payload.active !== undefined) data.active = payload.active;

    await this.dbRepository.update({
      entity: 'org_manual_item',
      where: { uuid: item.uuid },
      data: data as never
    });

    return this.toManual({ ...item, ...data } as OrgManualItemEntity);
  }

  async deleteManualItem(loggedUser: string, itemUuid: string): Promise<void> {
    const item = await this.requireOwnItem(loggedUser, itemUuid);

    // Baja lógica: los ingresos ya registrados referencian el producto y no
    // deben quedar apuntando a una fila inexistente.
    await this.dbRepository.update({
      entity: 'org_manual_item',
      where: { uuid: item.uuid },
      data: { isDeleted: true } as never
    });
  }

  private async requireOwnItem(
    loggedUser: string,
    itemUuid: string
  ): Promise<OrgManualItemEntity> {
    const org = await this.resolveOrganization(loggedUser);

    const item = (await this.dbRepository.findOne({
      entity: 'org_manual_item',
      where: { uuid: itemUuid, organizationUuid: org.uuid, isDeleted: IsNull() }
    })) as OrgManualItemEntity | null;

    if (!item) throw new NotFoundException('El ítem no existe o no es de tu productora');
    return item;
  }
}
