import { CouponType } from '@config/db/entities/tickets/coupon.entity';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { ISearchParams } from '@root/shared/decorators/search-query.decorator';
import { IOrderParams } from '@root/shared/decorators/order-query.decorator';
import { IFiltersParams } from '@root/shared/decorators/filter-query.decorator';
import {
  COUPON_ORDER_COLUMNS,
  CouponStatusFilter,
  couponFilters
} from '../../controllers/const/coupon.filters';

export interface ICoupon {
  uuid: string;
  eventUuid: string;
  name: string;
  code: string;
  type: CouponType;
  value: number;
  maxUses: number | null;
  usedCount: number;
  /** Suma de `coupon_redemption.discountAmount` (ARS descontados en órdenes pagadas). */
  totalDiscountAmount: number;
  oncePerUser: boolean;
  validFrom: Date | null;
  validUntil: Date | null;
  active: boolean;
  /** Tandas alcanzadas. Vacío = toda la compra (`BR-COUPON-009`). */
  ticketTypeUuids: string[];
  /** false si venció, se agotó o lo desactivaron (`BR-COUPON-002`) */
  usable: boolean;
  createdAt: Date;
}

export interface ICouponPayload {
  name: string;
  code: string;
  type: CouponType;
  value: number;
  maxUses?: number | null;
  oncePerUser?: boolean;
  validFrom?: string | null;
  validUntil?: string | null;
  active?: boolean;
  /** Tandas alcanzadas. Vacío o ausente = toda la compra (`BR-COUPON-009`). */
  ticketTypeUuids?: string[];
}

/** Una línea del carrito, para poder acotar el descuento a ciertas tandas. */
export interface ICouponLine {
  ticketTypeUuid: string;
  subtotal: number;
}

/** Resultado de aplicar un cupón, en el orden de `BR-COUPON-008`. */
export interface ICouponApplication {
  couponUuid: string;
  name: string;
  code: string;
  subtotal: number;
  /** Parte del subtotal sobre la que se calculó el descuento (`BR-COUPON-009`). */
  eligibleSubtotal: number;
  discountAmount: number;
  /** subtotal − descuento */
  discountedSubtotal: number;
}

export type ICouponStatusTotal = {
  status: CouponStatusFilter;
  count: number;
};

export type ICouponListResult = {
  items: ICoupon[];
  meta: PaginationMetaResponse;
  /** Conteo por estado del evento completo (sin filtros ni paginación). */
  byStatus: ICouponStatusTotal[];
  /** Suma de descuentos del evento completo. */
  totalDiscountAmount: number;
  totalUses: number;
  totalCoupons: number;
};

export interface ICouponService {
  listByEvent(
    eventUuid: string,
    loggedUser: string,
    opts?: {
      pagination?: IPaginationParams;
      search?: ISearchParams;
      filters?: IFiltersParams<typeof couponFilters>;
      order?: IOrderParams<typeof COUPON_ORDER_COLUMNS>;
    }
  ): Promise<ICouponListResult>;
  create(eventUuid: string, payload: ICouponPayload, loggedUser: string): Promise<ICoupon>;
  update(
    eventUuid: string,
    couponUuid: string,
    payload: Partial<ICouponPayload>,
    loggedUser: string
  ): Promise<ICoupon>;
  remove(eventUuid: string, couponUuid: string, loggedUser: string): Promise<void>;

  /**
   * Valida el código y devuelve cuánto descuenta.
   *
   * Recibe las líneas y no un total porque el cupón puede estar limitado a
   * ciertas tandas: el descuento se calcula solo sobre esas (`BR-COUPON-009`).
   */
  applyToSubtotal(
    eventUuid: string,
    code: string,
    lines: ICouponLine[],
    userUuid: string
  ): Promise<ICouponApplication>;

  /** Registra el uso al confirmarse el pago, no al crear la orden. */
  redeem(
    couponUuid: string,
    orderUuid: string,
    userUuid: string,
    discountAmount: number
  ): Promise<void>;
}
