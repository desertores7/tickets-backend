import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ClientAuth } from '@root/shared/auth/decorator/client-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
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
import { FAVORITE_ORDER_COLUMNS, favoriteFilters } from './const/favorite.filters';
import { IFavoriteService } from '../services/contracts/ifavorite.service';
import { CreateFavoriteRequest } from './dtos/create-favorite/create-favorite.request';
import {
  FavoriteItemResponse,
  FavoriteStatusResponse,
  ListMyFavoritesResponse
} from './responses/favorite.response';

@Controller('favorites')
export class FavoriteController {
  constructor(
    @Inject('IFavoriteService')
    private readonly favoriteService: IFavoriteService
  ) {}

  @ApiTags('Compra — Favoritos')
  @ClientAuth(null, ListMyFavoritesResponse)
  @ApiOperation({
    summary: 'Listar mis favoritos',
    description:
      'Eventos guardados del Cliente. Incluye eventos pasados. ' +
      'Filtro `timeframe`: upcoming | past | all. Búsqueda por nombre del evento.'
  })
  @ApiResponse({ status: 200, type: ListMyFavoritesResponse })
  @ApiPagination()
  @ApiSearch()
  @ApiFilter(favoriteFilters)
  @ApiOrder(FAVORITE_ORDER_COLUMNS)
  @HttpCode(200)
  @Get('me')
  async listMine(
    @User() userId: string,
    @PaginationParams() pagination: IPaginationParams,
    @SearchParams() search: ISearchParams,
    @FilterParams(favoriteFilters) filters: IFiltersParams<typeof favoriteFilters>,
    @OrderParams() order: IOrderParams<typeof FAVORITE_ORDER_COLUMNS>
  ): Promise<ListMyFavoritesResponse> {
    const page = await this.favoriteService.listMine(userId, pagination, search, filters, order);
    return new ListMyFavoritesResponse(page);
  }

  @ApiTags('Compra — Favoritos')
  @ClientAuth(null, FavoriteStatusResponse)
  @ApiOperation({
    summary: 'Obtener estado de favorito',
    description: 'Indica si el evento está guardado por el Cliente autenticado.'
  })
  @ApiParam({ name: 'eventUuid', description: 'UUID del evento' })
  @ApiResponse({ status: 200, type: FavoriteStatusResponse })
  @HttpCode(200)
  @Get('me/status/:eventUuid')
  async getStatus(
    @User() userId: string,
    @Param('eventUuid', ParseUUIDPipe) eventUuid: string
  ): Promise<FavoriteStatusResponse> {
    const status = await this.favoriteService.getStatus(userId, eventUuid);
    return new FavoriteStatusResponse(status.favorited, status.favoriteUuid);
  }

  @ApiTags('Compra — Favoritos')
  @ClientAuth(CreateFavoriteRequest, FavoriteItemResponse)
  @ApiOperation({
    summary: 'Guardar evento',
    description: 'Marca un evento publicado como favorito. Idempotente si ya estaba guardado.'
  })
  @ApiResponse({ status: 201, type: FavoriteItemResponse })
  @HttpCode(201)
  @Post()
  async add(
    @User() userId: string,
    @Body() body: CreateFavoriteRequest
  ): Promise<FavoriteItemResponse> {
    const item = await this.favoriteService.add(userId, body.eventUuid);
    return new FavoriteItemResponse(item);
  }

  @ApiTags('Compra — Favoritos')
  @ClientAuth(null, null)
  @ApiOperation({
    summary: 'Quitar favorito',
    description: 'Elimina el evento de la lista de guardados del Cliente.'
  })
  @ApiParam({ name: 'eventUuid', description: 'UUID del evento' })
  @ApiResponse({ status: 204, description: 'Favorito eliminado' })
  @HttpCode(204)
  @Delete(':eventUuid')
  async remove(
    @User() userId: string,
    @Param('eventUuid', ParseUUIDPipe) eventUuid: string
  ): Promise<void> {
    await this.favoriteService.remove(userId, eventUuid);
  }
}
