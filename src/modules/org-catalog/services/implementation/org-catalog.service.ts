import { Injectable, NotFoundException } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { DBRepository } from '@config/db/db.repository';
import { MpCatalogItemEntity } from '@config/db/entities/tickets/mp_catalog_item.entity';
import { OrgManualItemEntity } from '@config/db/entities/tickets/org_manual_item.entity';
import { OrganizationEntity } from '@config/db/entities/user/organization.entity';
import { v4 as uuidv4 } from 'uuid';
import {
  IManualItem,
  IManualItemPayload,
  IMpCatalogItem,
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

  async listMpCatalog(loggedUser: string): Promise<IMpCatalogItem[]> {
    const org = await this.resolveOrganization(loggedUser);

    const items = (await this.dbRepository.findMany({
      entity: 'mp_catalog_item',
      where: { organizationUuid: org.uuid, isDeleted: IsNull() },
      relations: { mpAccount: true },
      other: { order: { name: 'ASC' } }
    })) as (MpCatalogItemEntity & { mpAccount?: { uuid: string; alias: string } })[];

    return items.map(i => ({
      uuid: i.uuid,
      externalId: i.externalId,
      name: i.name,
      price: i.price === null ? null : Number(i.price),
      mpAccountUuid: i.orgMpAccountUuid,
      mpAccountAlias: i.mpAccount?.alias ?? '—',
      lastSyncAt: i.lastSyncAt
    }));
  }

  async listManualItems(loggedUser: string, onlyActive = false): Promise<IManualItem[]> {
    const org = await this.resolveOrganization(loggedUser);

    const where: Record<string, unknown> = {
      organizationUuid: org.uuid,
      isDeleted: IsNull()
    };
    if (onlyActive) where.active = true;

    const items = (await this.dbRepository.findMany({
      entity: 'org_manual_item',
      where: where as never,
      other: { order: { name: 'ASC' } }
    })) as OrgManualItemEntity[];

    return items.map(i => this.toManual(i));
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
