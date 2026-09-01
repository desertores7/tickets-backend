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
import { ICoupon, ICouponService } from '../services/contracts/icoupon.service';

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
    this.oncePerUser = data.oncePerUser;
    this.validFrom = data.validFrom ? new Date(data.validFrom).toISOString() : null;
    this.validUntil = data.validUntil ? new Date(data.validUntil).toISOString() : null;
    this.active = data.active;
    this.ticketTypeUuids = data.ticketTypeUuids;
    this.usable = data.usable;
    this.createdAt = new Date(data.createdAt).toISOString();
  }
}

export class CouponsResponse {
  @ApiProperty({ type: [CouponResponse] }) items: CouponResponse[];
  constructor(items: CouponResponse[]) {
    this.items = items;
  }
}

/**
 * Cupones de un evento (FP07 §16 / `BR-COUPON-001` a `008`).
 *
 * Un cupón pertenece siempre a un solo evento (`BR-COUPON-005`) y solo lo
 * gestiona la productora dueña (`BR-COUPON-004`).
 */
@ApiTags('Producer — Cupones')
@Controller({ path: 'events/:eventUuid/coupons', version: '1' })
export class CouponController {
  constructor(@Inject('ICouponService') private readonly couponService: ICouponService) {}

  @UserAuth(null, CouponsResponse)
  @ApiOperation({ summary: 'List coupons of the event' })
  @ApiParam({ name: 'eventUuid' })
  @HttpCode(200)
  @Get()
  async list(
    @Param('eventUuid') eventUuid: string,
    @User() loggedUser: string
  ): Promise<CouponsResponse> {
    const coupons = await this.couponService.listByEvent(eventUuid, loggedUser);
    return new CouponsResponse(coupons.map(c => new CouponResponse(c)));
  }

  @UserAuth(CreateCouponRequest, CouponResponse)
  @ApiOperation({
    summary: 'Create a coupon',
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
  @ApiOperation({ summary: 'Update a coupon' })
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
    summary: 'Delete a coupon',
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
