import { ManualItemCategory } from '@config/db/entities/tickets/org_manual_item.entity';

export interface IManualItem {
  uuid: string;
  name: string;
  referencePrice: number | null;
  category: ManualItemCategory | null;
  active: boolean;
  createdAt: Date;
}

export interface IMpCatalogItem {
  uuid: string;
  externalId: string;
  name: string;
  price: number | null;
  mpAccountUuid: string;
  mpAccountAlias: string;
  lastSyncAt: Date | null;
}

export interface IManualItemPayload {
  name: string;
  referencePrice?: number | null;
  category?: ManualItemCategory | null;
  active?: boolean;
}

export interface IOrgCatalogService {
  /** Catálogo copiado de Mercado Pago. Solo lectura (`BR-CASH-002`). */
  listMpCatalog(loggedUser: string): Promise<IMpCatalogItem[]>;

  listManualItems(loggedUser: string, onlyActive?: boolean): Promise<IManualItem[]>;
  createManualItem(loggedUser: string, payload: IManualItemPayload): Promise<IManualItem>;
  updateManualItem(
    loggedUser: string,
    itemUuid: string,
    payload: Partial<IManualItemPayload>
  ): Promise<IManualItem>;
  deleteManualItem(loggedUser: string, itemUuid: string): Promise<void>;
}
