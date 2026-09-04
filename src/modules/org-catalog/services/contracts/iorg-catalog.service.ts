import { ManualItemCategory } from '@config/db/entities/tickets/org_manual_item.entity';
import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { ISearchParams } from '@root/shared/decorators/search-query.decorator';
import { IFiltersParams } from '@root/shared/decorators/filter-query.decorator';
import { IOrderParams } from '@root/shared/decorators/order-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { MANUAL_ITEM_ORDER_COLUMNS, manualItemFilters } from '../../controllers/const/manual-item.filters';
import { MP_CATALOG_ORDER_COLUMNS, mpCatalogFilters } from '../../controllers/const/mp-catalog.filters';

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

export interface IManualItemCategoryTotal {
  category: ManualItemCategory | 'sin_categoria';
  count: number;
}

export interface IManualItemsListResult {
  items: IManualItem[];
  meta: PaginationMetaResponse;
  /** Totales de la org completa (ignora filtros/paginación). */
  totalItems: number;
  activeCount: number;
  inactiveCount: number;
  byCategory: IManualItemCategoryTotal[];
}

export interface IMpCatalogListResult {
  items: IMpCatalogItem[];
  meta: PaginationMetaResponse;
  /** Totales de la org completa (ignora filtros/paginación). */
  totalItems: number;
  lastSyncAt: Date | null;
}

export interface IOrgCatalogService {
  /** Catálogo copiado de Mercado Pago. Solo lectura (`BR-CASH-002`). */
  listMpCatalog(
    loggedUser: string,
    opts?: {
      pagination?: IPaginationParams;
      search?: ISearchParams;
      filters?: IFiltersParams<typeof mpCatalogFilters>;
      order?: IOrderParams<typeof MP_CATALOG_ORDER_COLUMNS>;
    }
  ): Promise<IMpCatalogListResult>;

  listManualItems(
    loggedUser: string,
    opts?: {
      pagination?: IPaginationParams;
      search?: ISearchParams;
      filters?: IFiltersParams<typeof manualItemFilters>;
      order?: IOrderParams<typeof MANUAL_ITEM_ORDER_COLUMNS>;
      /** Compat legacy: `?onlyActive=true` desde el picker de caja. */
      onlyActive?: boolean;
    }
  ): Promise<IManualItemsListResult>;

  createManualItem(loggedUser: string, payload: IManualItemPayload): Promise<IManualItem>;
  updateManualItem(
    loggedUser: string,
    itemUuid: string,
    payload: Partial<IManualItemPayload>
  ): Promise<IManualItem>;
  deleteManualItem(loggedUser: string, itemUuid: string): Promise<void>;
}
