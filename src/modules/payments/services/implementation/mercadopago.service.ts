import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { MercadoPagoConfig, Preference, Payment as MPPaymentClient } from 'mercadopago';
import { EnvService } from '@config/env/env.service';
import { PaymentStatus } from '@config/db/entities/tickets/payment.entity';
import { MercadoPagoWebhookRequest } from '@modules/payments/controllers/dtos/webhook/mercadopago-webhook.request';
import { IOrderItem, Order } from '@modules/orders/services/core/order';
import { User } from '@modules/user/services/core/user';

export type MPOrderItem = IOrderItem & { title: string };
export type OrderForMP = Omit<Order, 'items'> & {
  items: MPOrderItem[];
  eventName: string;
  /** Slug del evento: las pantallas de resultado del pago viven dentro del evento. */
  eventSlug: string | null;
};

export interface MPPreferenceResult {
  checkoutUrl: string;
  preferenceId: string;
}

/** Lo que manda el navegador para cobrar con tarjeta. Nunca incluye el número. */
export interface CardPaymentInput {
  /** Token de un solo uso generado por el SDK de MP contra sus propios iframes. */
  token: string;
  paymentMethodId: string;
  issuerId?: string | null;
  installments: number;
  identificationType: string;
  identificationNumber: string;
  /** Identifica el intento, no la orden: un rechazo se tiene que poder reintentar. */
  idempotencyKey: string;
  /**
   * Huella del dispositivo del comprador (`MP_DEVICE_SESSION_ID`). Mercado Pago
   * la usa para el scoring antifraude: sin ella rechaza más pagos legítimos.
   * Opcional porque el script puede fallar y eso no debe impedir cobrar.
   */
  deviceId?: string | null;
}

export interface CardPaymentResult {
  mpPaymentId: string;
  status: PaymentStatus;
  mpStatus: string;
  /** El motivo fino: es lo único que le permite al comprador corregir. */
  statusDetail: string | null;
  amount: number;
  currency: string;
  paymentMethod: string | null;
  paymentType: string | null;
  installments: number | null;
  paidAt: Date | null;
  rawResponse: Record<string, unknown>;
}

export interface PaymentWebhookResult {
  orderId: string;
  internalStatus: PaymentStatus;
  mpPaymentId: string;
  mpStatus: string;
  amount: number;
  currency: string;
  paymentMethod: string | null;
  paymentType: string | null;
  installments: number | null;
  paidAt: Date | null;
  rawResponse: Record<string, unknown>;
}

const MP_STATUS_MAP: Record<string, PaymentStatus> = {
  approved: PaymentStatus.APPROVED,
  rejected: PaymentStatus.REJECTED,
  pending: PaymentStatus.PENDING,
  in_process: PaymentStatus.IN_PROCESS,
  cancelled: PaymentStatus.CANCELLED,
  refunded: PaymentStatus.REFUNDED,
  charged_back: PaymentStatus.REFUNDED
};

/**
 * Lo que tira el SDK de Mercado Pago no es un `Error`: es un objeto con
 * `message`, `status` y un array `cause` con el detalle real. Pasarlo por
 * `String()` da "[object Object]" y se pierde justo lo único que sirve para
 * saber qué pasó.
 */
function describeMpError(error: unknown): { message: string; status: number | null; detail: unknown } {
  if (error instanceof Error) {
    return { message: error.message, status: null, detail: null };
  }

  if (error && typeof error === 'object') {
    const e = error as Record<string, any>;
    const causes: string[] = Array.isArray(e.cause)
      ? e.cause
          .map((c: any) => [c?.code, c?.description].filter(Boolean).join(': '))
          .filter(Boolean)
      : [];

    return {
      message: causes.length ? causes.join(' | ') : e.message ?? e.error ?? 'Error de Mercado Pago',
      status: typeof e.status === 'number' ? e.status : null,
      detail: error
    };
  }

  return { message: String(error), status: null, detail: null };
}

@Injectable()
export class MercadoPagoService {
  private readonly logger = new Logger(MercadoPagoService.name);
  private readonly client: MercadoPagoConfig;

  constructor(private readonly envService: EnvService) {
    const accessToken = this.envService.get('MERCADOPAGO_ACCESS_TOKEN');
    if (!accessToken) {
      this.logger.warn('MERCADOPAGO_ACCESS_TOKEN is not configured — payment features will not work');
    }
    this.client = new MercadoPagoConfig({ accessToken: accessToken ?? '' });
  }

  async initializePreference(order: OrderForMP, user: User): Promise<MPPreferenceResult> {
    const preference = new Preference(this.client);

    const appUrl = (this.envService.get('APP_URL') ?? '').replace(/\/$/, '');
    // back_urls son páginas que ve el comprador → frontend. notification_url es el webhook → backend.
    const frontendUrl = (this.envService.get('FRONTEND_URL') ?? '').replace(/\/$/, '');
    // Las pantallas de resultado viven dentro del evento
    // (`/events/<slug>/payment/...`): el comprador vuelve a un lugar que
    // reconoce, con el evento a la vista. Sin slug no hay a dónde volver, así
    // que se cae a "Mis compras", que sirve para los tres resultados.
    const resultBase = order.eventSlug
      ? `${frontendUrl}/events/${encodeURIComponent(order.eventSlug)}/payment`
      : null;
    const fallbackUrl = `${frontendUrl}/client/payments`;
    const backUrlSuccess = resultBase ? `${resultBase}/success` : fallbackUrl;
    const backUrlFailure = resultBase ? `${resultBase}/failure` : fallbackUrl;
    const backUrlPending = resultBase ? `${resultBase}/pending` : fallbackUrl;
    const notificationUrl = `${appUrl}/api/v1/payments/webhook/mercadopago`;

    // Trabajar en centavos (enteros) evita errores de punto flotante al sumar.
    const toCents = (value: number) => Math.round(Number(value) * 100);

    // 1. Un ítem por order_item con el precio BASE de la entrada (sin fee).
    const ticketItems = order.items.map(item => ({
      id: item.ticketTypeUuid,
      title: `${order.eventName} - ${item.title}`,
      description: 'Entrada',
      quantity: item.quantity,
      unit_price: Number(item.unitPrice),
      currency_id: order.currency
    }));

    // 2. Ítem de costo de servicio. Se calcula como la diferencia entre el total
    // de la orden y la suma de las entradas base, de modo que el fee absorba
    // cualquier resto de centavos y Σ(unit_price * quantity) === order.total exacto
    // (MercadoPago valida que el total de la preferencia cierre con los ítems).
    const itemsBaseCents = order.items.reduce(
      (sum, item) => sum + toCents(item.unitPrice) * item.quantity,
      0
    );
    const serviceFeeCents = toCents(order.total) - itemsBaseCents;

    const items = [...ticketItems];
    if (serviceFeeCents > 0) {
      items.push({
        id: 'service-fee',
        title: 'Costo de servicio',
        description: 'Cargo por uso de la plataforma',
        quantity: 1,
        unit_price: serviceFeeCents / 100,
        currency_id: order.currency
      });
    }

    try {
      const result = await preference.create({
        body: {
          items,
          payer: {
            name: user.firstName,
            surname: user.lastName,
            email: user.email
          },
          back_urls: {
            success: backUrlSuccess ?? '',
            failure: backUrlFailure ?? '',
            pending: backUrlPending ?? ''
          },
          auto_return: 'approved' as const,
          notification_url: notificationUrl,
          external_reference: order.uuid,
          expires: true,
          expiration_date_to: order.expiresAt.toISOString(),
          statement_descriptor: 'TICKETERA'
        }
      });

      if (!result.init_point || !result.id) {
        throw new Error('MercadoPago did not return init_point or preference id');
      }

      return {
        checkoutUrl: result.init_point,
        preferenceId: result.id
      };
    } catch (error) {
      this.logger.error('Failed to create MercadoPago preference', {
        orderId: order.uuid,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Cobro con tarjeta — Checkout API (`payment.create`).
   *
   * A diferencia de la preferencia, acá **no hay ítems que cobrar**: se cobra un
   * único `transaction_amount`. El costo de servicio va incluido igual, pero el
   * desglose lo muestra nuestra pantalla, no Mercado Pago. Los ítems viajan en
   * `additional_info` porque MP los usa para decidir si aprueba.
   *
   * El `token` viene del navegador y **nunca vemos el número de tarjeta**: lo
   * tokeniza el SDK de MP contra sus propios iframes. Ese es el motivo de que
   * este método reciba un token y no datos de tarjeta.
   */
  async createCardPayment(
    order: OrderForMP,
    user: User,
    card: CardPaymentInput
  ): Promise<CardPaymentResult> {
    const mpClient = new MPPaymentClient(this.client);
    const appUrl = (this.envService.get('APP_URL') ?? '').replace(/\/$/, '');

    const additionalItems = order.items.map(item => ({
      id: item.ticketTypeUuid,
      title: `${order.eventName} - ${item.title}`,
      description: 'Entrada',
      quantity: item.quantity,
      unit_price: Number(item.unitPrice)
    }));

    try {
      const result = await mpClient.create({
        body: {
          transaction_amount: Number(order.total),
          token: card.token,
          installments: card.installments,
          payment_method_id: card.paymentMethodId,
          // El SDK del navegador devuelve el issuer como string y el de Node lo
          // tipa como número: se convierte acá, en el borde.
          ...(card.issuerId ? { issuer_id: Number(card.issuerId) } : {}),
          description: `Entradas — ${order.eventName}`,
          external_reference: order.uuid,
          notification_url: `${appUrl}/api/v1/payments/webhook/mercadopago`,
          statement_descriptor: 'TICKETERA',
          payer: {
            email: user.email,
            first_name: user.firstName,
            last_name: user.lastName,
            identification: {
              type: card.identificationType,
              number: card.identificationNumber
            }
          },
          additional_info: {
            items: additionalItems
          }
        },
        requestOptions: {
          // Segunda red contra el doble cobro: si el comprador manda dos veces
          // el mismo intento, MP devuelve el pago original en vez de cobrar de
          // nuevo. La key es del intento, no de la orden: un rechazo tiene que
          // poder reintentarse con otra tarjeta.
          idempotencyKey: card.idempotencyKey,
          // Viaja como `X-Meli-Session-Id`. La tokenización ya lleva el device
          // id por su cuenta, pero este cobro sale del backend: si no se
          // reenvía acá, MP puntúa el pago sin saber desde dónde se hizo.
          ...(card.deviceId ? { meliSessionId: card.deviceId } : {})
        }
      });

      const mpStatus = result.status ?? '';

      return {
        mpPaymentId: String(result.id ?? ''),
        status: MP_STATUS_MAP[mpStatus] ?? PaymentStatus.PENDING,
        mpStatus,
        statusDetail: result.status_detail ?? null,
        amount: Number(result.transaction_amount ?? order.total),
        currency: result.currency_id ?? order.currency,
        paymentMethod: result.payment_method_id ?? null,
        paymentType: result.payment_type_id ?? null,
        installments: result.installments ?? card.installments,
        paidAt: result.date_approved ? new Date(result.date_approved) : null,
        rawResponse: result as unknown as Record<string, unknown>
      };
    } catch (error) {
      const { message, status, detail } = describeMpError(error);

      this.logger.error(
        `Failed to create MercadoPago card payment orderId=${order.uuid} status=${status ?? '-'} ` +
          `message=${message}`
      );
      // El objeto completo aparte: ahí está el `cause` con el código de MP.
      if (detail) this.logger.error(JSON.stringify(detail));

      // Un 4xx de MP es un problema del intento (token vencido, datos que no
      // cierran), no una falla nuestra: devolverlo como 500 le dice al
      // comprador que se rompió el sistema cuando puede corregir y reintentar.
      if (status !== null && status >= 400 && status < 500) {
        throw new BadRequestException(`Mercado Pago rechazó el intento: ${message}`);
      }

      throw error;
    }
  }

  async processWebhookPayload(payload: MercadoPagoWebhookRequest): Promise<PaymentWebhookResult | null> {
    if (payload.type !== 'payment') {
      this.logger.log(`Ignoring MP webhook with type: ${payload.type}`);
      return null;
    }

    const mpPaymentId = payload.data?.id;
    if (!mpPaymentId) {
      this.logger.warn('MP payment webhook without data.id — ignored');
      return null;
    }

    try {
      const mpClient = new MPPaymentClient(this.client);
      const paymentData = await mpClient.get({ id: mpPaymentId });

      const orderId = paymentData.external_reference ?? '';
      const mpStatus = paymentData.status ?? '';
      const internalStatus = MP_STATUS_MAP[mpStatus] ?? PaymentStatus.PENDING;

      return {
        orderId,
        internalStatus,
        mpPaymentId: String(paymentData.id),
        mpStatus,
        amount: paymentData.transaction_amount ?? 0,
        currency: paymentData.currency_id ?? 'ARS',
        paymentMethod: paymentData.payment_method_id ?? null,
        paymentType: paymentData.payment_type_id ?? null,
        installments: paymentData.installments ?? null,
        paidAt: paymentData.date_approved ? new Date(paymentData.date_approved) : null,
        rawResponse: paymentData as unknown as Record<string, unknown>
      };
    } catch (error) {
      this.logger.error('Failed to fetch payment from MercadoPago', {
        mpPaymentId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}
