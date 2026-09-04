import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserAuth } from '@root/shared/auth/decorator/user-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import {
  ApiFilter,
  FilterParams,
  IFiltersParams
} from '@root/shared/decorators/filter-query.decorator';
import {
  ApiOrder,
  IOrderParams,
  OrderParams
} from '@root/shared/decorators/order-query.decorator';
import {
  ApiPagination,
  IPaginationParams,
  PaginationParams
} from '@root/shared/decorators/pagination-query.decorator';
import {
  ApiSearch,
  ISearchParams,
  SearchParams
} from '@root/shared/decorators/search-query.decorator';
import { IOrgCatalogService } from '../services/contracts/iorg-catalog.service';
import {
  MANUAL_ITEM_ORDER_COLUMNS,
  manualItemFilters
} from './const/manual-item.filters';
import { MP_CATALOG_ORDER_COLUMNS, mpCatalogFilters } from './const/mp-catalog.filters';
import {
  CreateManualItemRequest,
  ManualItemCategoryTotalResponse,
  ManualItemResponse,
  ManualItemsResponse,
  MpCatalogItemResponse,
  MpCatalogResponse,
  UpdateManualItemRequest
} from './dtos/catalog.dto';

/**
 * Catálogo de la productora (FP11 §3 / `BR-CASH-002`).
 *
 * Dos orígenes: lo copiado desde Mercado Pago (solo lectura) y los ítems que
 * carga la productora a mano. Ambos son org-wide: todos los eventos ven lo mismo.
 */
@ApiTags('Productora — Catálogo')
@Controller({ path: 'organizations/me', version: '1' })
export class OrgCatalogController {
  constructor(@Inject('IOrgCatalogService') private readonly catalogService: IOrgCatalogService) {}

  @UserAuth(null, MpCatalogResponse)
  @ApiOperation({
    summary: 'Listar catálogo de Mercado Pago',
    description:
      'Products copied from the connected Mercado Pago accounts. Read-only: it is refreshed with ' +
      'the "Actualizar catálogo" action, never automatically (`BR-CASH-002`).\n\n' +
      'Filtros: `accountUuid`, `search` (nombre), `order_by` (name|price|lastSyncAt).'
  })
  @ApiPagination()
  @ApiSearch()
  @ApiFilter(mpCatalogFilters)
  @ApiOrder(MP_CATALOG_ORDER_COLUMNS)
  @HttpCode(200)
  @Get('mp-catalog')
  async listMpCatalog(
    @User() loggedUser: string,
    @PaginationParams() pagination: IPaginationParams,
    @SearchParams() search: ISearchParams,
    @FilterParams(mpCatalogFilters) filters: IFiltersParams<typeof mpCatalogFilters>,
    @OrderParams() order: IOrderParams<typeof MP_CATALOG_ORDER_COLUMNS>
  ): Promise<MpCatalogResponse> {
    const result = await this.catalogService.listMpCatalog(loggedUser, {
      pagination,
      search,
      filters,
      order
    });
    return new MpCatalogResponse(
      result.items.map(i => new MpCatalogItemResponse(i)),
      {
        meta: result.meta,
        totalItems: result.totalItems,
        lastSyncAt: result.lastSyncAt
      }
    );
  }

  @UserAuth(null, ManualItemsResponse)
  @ApiOperation({
    summary: 'Listar ítems manuales',
    description:
      'Organization-wide: every event of the producer sees the same items.\n\n' +
      'Filtros: `category`, `active` (true|false), `search` (nombre), `order_by` ' +
      '(name|createdAt|referencePrice). Compat: `onlyActive=true` ≡ `active=true`.'
  })
  @ApiPagination()
  @ApiSearch()
  @ApiFilter(manualItemFilters)
  @ApiOrder(MANUAL_ITEM_ORDER_COLUMNS)
  @ApiQuery({
    name: 'onlyActive',
    required: false,
    description: 'Compat legacy: true to exclude inactive items (same as active=true).'
  })
  @HttpCode(200)
  @Get('manual-items')
  async listManualItems(
    @User() loggedUser: string,
    @PaginationParams() pagination: IPaginationParams,
    @SearchParams() search: ISearchParams,
    @FilterParams(manualItemFilters) filters: IFiltersParams<typeof manualItemFilters>,
    @OrderParams() order: IOrderParams<typeof MANUAL_ITEM_ORDER_COLUMNS>,
    @Query('onlyActive') onlyActive?: string
  ): Promise<ManualItemsResponse> {
    const result = await this.catalogService.listManualItems(loggedUser, {
      pagination,
      search,
      filters,
      order,
      onlyActive: onlyActive === 'true'
    });
    return new ManualItemsResponse(
      result.items.map(i => new ManualItemResponse(i)),
      {
        meta: result.meta,
        totalItems: result.totalItems,
        activeCount: result.activeCount,
        inactiveCount: result.inactiveCount,
        byCategory: result.byCategory.map(c => new ManualItemCategoryTotalResponse(c))
      }
    );
  }

  @UserAuth(CreateManualItemRequest, ManualItemResponse)
  @ApiOperation({ summary: 'Crear ítem manual' })
  @HttpCode(201)
  @Post('manual-items')
  async createManualItem(
    @User() loggedUser: string,
    @Body() body: CreateManualItemRequest
  ): Promise<ManualItemResponse> {
    return new ManualItemResponse(await this.catalogService.createManualItem(loggedUser, body));
  }

  @UserAuth(UpdateManualItemRequest, ManualItemResponse)
  @ApiOperation({
    summary: 'Actualizar ítem manual',
    description:
      'Changing the reference price does NOT alter incomes already registered (`BR-CASH-002`).'
  })
  @ApiParam({ name: 'itemUuid' })
  @HttpCode(200)
  @Patch('manual-items/:itemUuid')
  async updateManualItem(
    @User() loggedUser: string,
    @Param('itemUuid') itemUuid: string,
    @Body() body: UpdateManualItemRequest
  ): Promise<ManualItemResponse> {
    return new ManualItemResponse(
      await this.catalogService.updateManualItem(loggedUser, itemUuid, body)
    );
  }

  @UserAuth(null, null)
  @ApiOperation({
    summary: 'Eliminar ítem manual',
    description: 'Logical delete: incomes already registered keep referencing the product.'
  })
  @ApiParam({ name: 'itemUuid' })
  @HttpCode(204)
  @Delete('manual-items/:itemUuid')
  async deleteManualItem(
    @User() loggedUser: string,
    @Param('itemUuid') itemUuid: string
  ): Promise<void> {
    await this.catalogService.deleteManualItem(loggedUser, itemUuid);
  }
}
