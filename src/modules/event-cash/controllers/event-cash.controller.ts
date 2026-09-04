import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
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
import { ApiSearch, ISearchParams, SearchParams } from '@root/shared/decorators/search-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { IEventCashService } from '../services/contracts/ievent-cash.service';
import { incomeFilters, INCOME_ORDER_COLUMNS } from './const/income.filters';
import {
  CashSummaryResponse,
  CreateIncomeRequest,
  IncomeResponse,
  IncomesResponse,
  UpdateIncomeRequest
} from './dtos/income.dto';

/**
 * Caja / ingresos del evento (FP11 §5c).
 *
 * No hay entidad de caja ni barra (`BR-CASH-013`): las ventas físicas generan
 * ingresos directos y quién cobró queda en `createdBy`.
 *
 * Permisos (`BR-CASH-014`): el Productor hace CRUD completo; el rol Caja
 * asignado al evento **solo puede crear y ver**.
 */
@ApiTags('Productora — Caja')
@Controller({ path: 'events/:eventUuid/incomes', version: '1' })
export class EventCashController {
  constructor(
    @Inject('IEventCashService') private readonly eventCashService: IEventCashService
  ) {}

  @UserAuth(null, IncomesResponse)
  @ApiOperation({
    summary: 'Listar ingresos',
    description:
      'Producer and the cashiers assigned to this event.\n' +
      '- `search`: coincidencia parcial sobre notas, productos o quién cobró.\n' +
      '- `method`: cash | mercadopago | other.\n' +
      '- `order_by`: occurredAt:desc|asc, total:desc|asc.'
  })
  @ApiParam({ name: 'eventUuid' })
  @ApiPagination()
  @ApiSearch()
  @ApiFilter(incomeFilters)
  @ApiOrder(INCOME_ORDER_COLUMNS)
  @HttpCode(200)
  @Get()
  async list(
    @Param('eventUuid') eventUuid: string,
    @User() loggedUser: string,
    @PaginationParams() pagination: IPaginationParams,
    @SearchParams() search: ISearchParams,
    @FilterParams(incomeFilters) filters: IFiltersParams<typeof incomeFilters>,
    @OrderParams() order: IOrderParams<typeof INCOME_ORDER_COLUMNS>
  ): Promise<IncomesResponse> {
    const result = await this.eventCashService.listIncomes(eventUuid, loggedUser, {
      page: pagination.page,
      limit: pagination.limit,
      search: search?.search,
      method: filters?.method?.[0] as 'cash' | 'mercadopago' | 'other' | undefined,
      orderBy:
        order?.order_by === 'total' || order?.order_by === 'occurredAt'
          ? order.order_by
          : 'occurredAt',
      orderDir: order?.order_direction === 'asc' ? 'ASC' : 'DESC'
    });

    return new IncomesResponse(
      result.items.map(i => new IncomeResponse(i)),
      {
        meta: new PaginationMetaResponse(result.meta),
        total: result.total
      }
    );
  }

  @UserAuth(null, CashSummaryResponse)
  @ApiOperation({
    summary: 'Obtener resumen de caja',
    description:
      'KPIs of the event cash (`29` §5a / BR-CASH-007). Producer only: the cashier loads and sees ' +
      'incomes, but not the result of the event. MP KPIs come from the movements copied by the ' +
      'sync job during the event window (BR-CASH-003).'
  })
  @ApiParam({ name: 'eventUuid' })
  @HttpCode(200)
  @Get('summary')
  async summary(
    @Param('eventUuid') eventUuid: string,
    @User() loggedUser: string
  ): Promise<CashSummaryResponse> {
    return new CashSummaryResponse(
      await this.eventCashService.getSummary(eventUuid, loggedUser)
    );
  }

  @UserAuth(CreateIncomeRequest, IncomeResponse)
  @ApiOperation({
    summary: 'Registrar ingreso',
    description:
      'Producer and cashier (`BR-CASH-014`). Needs at least one product. Product names and prices ' +
      'are stored as a snapshot: later catalog changes must not alter recorded sales (BR-CASH-002).'
  })
  @ApiParam({ name: 'eventUuid' })
  @HttpCode(201)
  @Post()
  async create(
    @Param('eventUuid') eventUuid: string,
    @Body() body: CreateIncomeRequest,
    @User() loggedUser: string
  ): Promise<IncomeResponse> {
    return new IncomeResponse(
      await this.eventCashService.createIncome(eventUuid, body, loggedUser)
    );
  }

  @UserAuth(UpdateIncomeRequest, IncomeResponse)
  @ApiOperation({
    summary: 'Actualizar ingreso',
    description: 'Producer only (`BR-CASH-014`). Sending `products` replaces all lines.'
  })
  @ApiParam({ name: 'eventUuid' })
  @ApiParam({ name: 'incomeUuid' })
  @HttpCode(200)
  @Patch(':incomeUuid')
  async update(
    @Param('eventUuid') eventUuid: string,
    @Param('incomeUuid') incomeUuid: string,
    @Body() body: UpdateIncomeRequest,
    @User() loggedUser: string
  ): Promise<IncomeResponse> {
    return new IncomeResponse(
      await this.eventCashService.updateIncome(eventUuid, incomeUuid, body, loggedUser)
    );
  }

  @UserAuth(null, null)
  @ApiOperation({
    summary: 'Eliminar ingreso',
    description:
      'Producer only, and it is a **physical** delete (`BR-CASH-014`): a mis-entered charge at the ' +
      'door is removed, not archived.'
  })
  @ApiParam({ name: 'eventUuid' })
  @ApiParam({ name: 'incomeUuid' })
  @HttpCode(204)
  @Delete(':incomeUuid')
  async remove(
    @Param('eventUuid') eventUuid: string,
    @Param('incomeUuid') incomeUuid: string,
    @User() loggedUser: string
  ): Promise<void> {
    await this.eventCashService.deleteIncome(eventUuid, incomeUuid, loggedUser);
  }
}
