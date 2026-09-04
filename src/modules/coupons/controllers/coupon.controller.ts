import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min
} from 'class-validator';
import { COUPON_TYPES, CouponType } from '@config/db/entities/tickets/coupon.entity';
import { UserAuth } from '@root/shared/auth/decorator/user-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import {
  ApiPagination,
  IPaginationParams,
  PaginationParams
} from '@root/shared/decorators/pagination-query.decorator';
import { ApiSearch, ISearchParams, SearchParams } from '@root/shared/decorators/search-query.decorator';
import { ApiFilter, FilterParams, IFiltersParams } from '@root/shared/decorators/filter-query.decorator';
import { ApiOrder, IOrderParams, OrderParams } from '@root/shared/decorators/order-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { ICoupon, ICouponService, ICouponStatusTotal } from '../services/contracts/icoupon.service';
import {
  COUPON_ORDER_COLUMNS,
  COUPON_STATUS_FILTERS,
  couponFilters
} from './const/coupon.filters';

/** Sin constructor: `plainToInstance` instancia los request sin argumentos. */
export class CreateCouponRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @ApiProperty({ description: 'Nombre visible para el comprador', example: 'Early bird' })
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  @ApiProperty({ description: 'Lo que tipea el comprador. Se guarda en mayúsculas.', example: 'EARLY20' })
  code: string;

  @IsIn([...COUPON_TYPES])
  @ApiProperty({ enum: COUPON_TYPES })
  type: CouponType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @ApiProperty({ description: 'Porcentaje 1–100 si es percent; monto en ARS si es fixed' })
  value: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({ description: 'Null o ausente = ilimitado' })
  maxUses?: number | null;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ default: false })
  oncePerUser?: boolean;

  @IsOptional()
  @IsISO8601()
  @ApiPropertyOptional()
  validFrom?: string | null;

  @IsOptional()
  @IsISO8601()
  @ApiPropertyOptional()
  validUntil?: string | null;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ default: true })
  active?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ApiPropertyOptional({
    type: [String],
    description:
      'Tandas alcanzadas. Vacío o ausente = el descuento aplica a toda la compra. ' +
      'Con tandas, se calcula solo sobre esas líneas (BR-COUPON-009).'
  })
  ticketTypeUuids?: string[];
}

export class UpdateCouponRequest extends CreateCouponRequest {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @ApiPropertyOptional()
  declare name: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @ApiPropertyOptional()
  declare code: string;

  @IsOptional()
  @IsIn([...COUPON_TYPES])
  @ApiPropertyOptional({ enum: COUPON_TYPES })
  declare type: CouponType;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @ApiPropertyOptional()
  declare value: number;
}

export class CouponResponse {
  @ApiProperty() uuid: string;
  @ApiProperty() name: string;
  @ApiProperty() code: string;
  @ApiProperty({ enum: COUPON_TYPES }) type: CouponType;
  @ApiProperty() value: number;
  @ApiProperty({ nullable: true, description: 'Null = ilimitado' }) maxUses: number | null;
  @ApiProperty() usedCount: number;
  @ApiProperty({ description: 'Suma de descuentos aplicados en órdenes pagadas (ARS)' })
  totalDiscountAmount: number;
  @ApiProperty() oncePerUser: boolean;
  @ApiProperty({ nullable: true }) validFrom: string | null;
  @ApiProperty({ nullable: true }) validUntil: string | null;
  @ApiProperty() active: boolean;

  @ApiProperty({
    type: [String],
    description: 'Tandas alcanzadas. Vacío = toda la compra (BR-COUPON-009).'
  })
  ticketTypeUuids: string[];

  @ApiProperty({
    description: 'false si venció, se agotó o lo desactivaron. Se calcula al leer (BR-COUPON-002).'
  })
  usable: boolean;

  @ApiProperty({ description: 'ISO-8601' }) createdAt: string;

  constructor(data: ICoupon) {
    this.uuid = data.uuid;
    this.name = data.name;
    this.code = data.code;
    this.type = data.type;
    this.value = data.value;
    this.maxUses = data.maxUses;
    this.usedCount = data.usedCount;
    this.totalDiscountAmount = data.totalDiscountAmount;
    this.oncePerUser = data.oncePerUser;
    this.validFrom = data.validFrom ? new Date(data.validFrom).toISOString() : null;
    this.validUntil = data.validUntil ? new Date(data.validUntil).toISOString() : null;
    this.active = data.active;
    this.ticketTypeUuids = data.ticketTypeUuids;
    this.usable = data.usable;
    this.createdAt = new Date(data.createdAt).toISOString();
  }
}

export class CouponStatusTotalResponse {
  @ApiProperty({ enum: COUPON_STATUS_FILTERS }) status: string;
  @ApiProperty() count: number;

  constructor(status: string, count: number) {
    this.status = status;
    this.count = count;
  }
}

export class CouponsResponse {
  @ApiProperty({ type: [CouponResponse] }) items: CouponResponse[];

  @ApiProperty({
    description: 'Suma de descuentos del evento (ignora filtros y paginación)'
  })
  totalDiscountAmount: number;

  @ApiProperty({ description: 'Usos totales del evento (ignora filtros y paginación)' })
  totalUses: number;

  @ApiProperty({ description: 'Cantidad de cupones del evento (ignora filtros y paginación)' })
  totalCoupons: number;

  @ApiProperty({
    type: [CouponStatusTotalResponse],
    description: 'Conteo por estado del evento completo'
  })
  byStatus: CouponStatusTotalResponse[];

  @ApiProperty({ type: PaginationMetaResponse, required: false })
  meta?: PaginationMetaResponse;

  constructor(
    items: CouponResponse[],
    byStatus: ICouponStatusTotal[],
    opts: {
      meta: PaginationMetaResponse;
      totalDiscountAmount: number;
      totalUses: number;
      totalCoupons: number;
    }
  ) {
    this.items = items;
    this.byStatus = byStatus.map(s => new CouponStatusTotalResponse(s.status, s.count));
    this.meta = opts.meta;
    this.totalDiscountAmount = opts.totalDiscountAmount;
    this.totalUses = opts.totalUses;
    this.totalCoupons = opts.totalCoupons;
  }
}

/**
 * Cupones de un evento (FP07 §16 / `BR-COUPON-001` a `008`).
 *
 * Un cupón pertenece siempre a un solo evento (`BR-COUPON-005`) y solo lo
 * gestiona la productora dueña (`BR-COUPON-004`).
 */
@ApiTags('Productora — Cupones')
@Controller({ path: 'events/:eventUuid/coupons', version: '1' })
export class CouponController {
  constructor(@Inject('ICouponService') private readonly couponService: ICouponService) {}

  @UserAuth(null, CouponsResponse)
  @ApiOperation({
    summary: 'Listar cupones',
    description:
      'Filtros y paginación estrechan `items`, pero `byStatus`, `totalDiscountAmount`, ' +
      '`totalUses` y `totalCoupons` siempre reflejan el evento completo.\n\n' +
      '- `search`: nombre o código.\n' +
      '- `type`: percent | fixed.\n' +
      '- `status`: usable | paused | exhausted | expired.\n' +
      '- `order_by`: createdAt, usedCount, name (asc|desc).'
  })
  @ApiParam({ name: 'eventUuid' })
  @ApiPagination()
  @ApiSearch()
  @ApiFilter(couponFilters)
  @ApiOrder(COUPON_ORDER_COLUMNS)
  @HttpCode(200)
  @Get()
  async list(
    @Param('eventUuid') eventUuid: string,
    @User() loggedUser: string,
    @PaginationParams() pagination: IPaginationParams,
    @SearchParams() search: ISearchParams,
    @FilterParams(couponFilters) filters: IFiltersParams<typeof couponFilters>,
    @OrderParams() order: IOrderParams<typeof COUPON_ORDER_COLUMNS>
  ): Promise<CouponsResponse> {
    const result = await this.couponService.listByEvent(eventUuid, loggedUser, {
      pagination,
      search,
      filters,
      order
    });
    return new CouponsResponse(
      result.items.map(c => new CouponResponse(c)),
      result.byStatus,
      {
        meta: result.meta,
        totalDiscountAmount: result.totalDiscountAmount,
        totalUses: result.totalUses,
        totalCoupons: result.totalCoupons
      }
    );
  }

  @UserAuth(null, CouponResponse)
  @ApiOperation({ summary: 'Obtener cupón' })
  @ApiParam({ name: 'eventUuid' })
  @ApiParam({ name: 'couponUuid' })
  @HttpCode(200)
  @Get(':couponUuid')
  async getOne(
    @Param('eventUuid') eventUuid: string,
    @Param('couponUuid') couponUuid: string,
    @User() loggedUser: string
  ): Promise<CouponResponse> {
    return new CouponResponse(await this.couponService.getByUuid(eventUuid, couponUuid, loggedUser));
  }

  @UserAuth(CreateCouponRequest, CouponResponse)
  @ApiOperation({
    summary: 'Crear cupón',
    description: 'The code is unique within the event and stored uppercase.'
  })
  @ApiParam({ name: 'eventUuid' })
  @HttpCode(201)
  @Post()
  async create(
    @Param('eventUuid') eventUuid: string,
    @Body() body: CreateCouponRequest,
    @User() loggedUser: string
  ): Promise<CouponResponse> {
    return new CouponResponse(await this.couponService.create(eventUuid, body, loggedUser));
  }

  @UserAuth(UpdateCouponRequest, CouponResponse)
  @ApiOperation({ summary: 'Actualizar cupón' })
  @ApiParam({ name: 'eventUuid' })
  @ApiParam({ name: 'couponUuid' })
  @HttpCode(200)
  @Patch(':couponUuid')
  async update(
    @Param('eventUuid') eventUuid: string,
    @Param('couponUuid') couponUuid: string,
    @Body() body: UpdateCouponRequest,
    @User() loggedUser: string
  ): Promise<CouponResponse> {
    return new CouponResponse(
      await this.couponService.update(eventUuid, couponUuid, body, loggedUser)
    );
  }

  @UserAuth(null, null)
  @ApiOperation({
    summary: 'Eliminar cupón',
    description: 'Logical delete: paid orders still reference it.'
  })
  @ApiParam({ name: 'eventUuid' })
  @ApiParam({ name: 'couponUuid' })
  @HttpCode(204)
  @Delete(':couponUuid')
  async remove(
    @Param('eventUuid') eventUuid: string,
    @Param('couponUuid') couponUuid: string,
    @User() loggedUser: string
  ): Promise<void> {
    await this.couponService.remove(eventUuid, couponUuid, loggedUser);
  }
}
