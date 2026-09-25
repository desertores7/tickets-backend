import { randomUUID } from 'crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { MercadoPagoConfig, Preference, Payment as MPPaymentClient } from 'mercadopago';
import { EnvService } from '@config/env/env.service';
import { PaymentStatus } from '@config/db/entities/tickets/payment.entity';
import { MercadoPagoWebhookRequest } from '@modules/payments/controllers/dtos/webhook/mercadopago-webhook.request';
import { IOrderItem, Order } from '@modules/orders/services/core/order';
import { User } from '@modules/user/services/core/user';
import { extractApiErrorCode } from '../core/card-rejection';

/** Prefijo del `statusDetail` sintético para un rechazo en la CREACIÓN del
 * pago (código numérico de MP, ej. `4390`) — para distinguirlo de un
 * `status_detail` real de rechazo bancario (`cc_rejected_*`). */
export const API_ERROR_STATUS_PREFIX = 'api_error_';

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

/** Un contracargo tal como lo describe Mercado Pago. */
export interface MPChargebackResult {
  mpChargebackId: string;
  /** Primer pago disputado: en nuestro modelo un contracargo es de un pago. */
  mpPaymentId: string | null;
  amount: number;
  currency: string;
  status: string;
  documentationRequired: boolean;
  documentationStatus: string | null;
  documentationDeadline: Date | null;
  coverageApplied: boolean;
  createdAt: Date | null;
  raw: Record<string, unknown>;
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
    //
    // Con cupón (BR-COUPON-008) la línea va con su precio YA descontado. Mercado
    // Pago no acepta ítems negativos, así que el descuento no puede ir como un
    // ítem aparte; y repartirlo por unidad deja centavos sueltos, por eso la
    // línea descontada viaja como un solo ítem con el importe de toda la línea.
    const ticketItems = order.items.map(item => {
      const discountCents = toCents(item.discountAmount ?? 0);
      if (discountCents <= 0) {
        return {
          id: item.ticketTypeUuid,
          title: `${order.eventName} - ${item.title}`,
          description: 'Entrada',
          quantity: item.quantity,
          unit_price: Number(item.unitPrice),
          currency_id: order.currency
        };
      }
      const lineCents = Math.max(0, toCents(item.unitPrice) * item.quantity - discountCents);
      return {
        id: item.ticketTypeUuid,
        title: `${order.eventName} - ${item.title}${item.quantity > 1 ? ` (x${item.quantity})` : ''}`,
        description: 'Entrada con cupón de descuento',
        quantity: 1,
        unit_price: lineCents / 100,
        currency_id: order.currency
      };
    });

    // 2. Ítem de costo de servicio. Se calcula como la diferencia entre el total
    // de la orden y la suma de las entradas, de modo que el fee absorba
    // cualquier resto de centavos y Σ(unit_price * quantity) === order.total exacto
    // (MercadoPago valida que el total de la preferencia cierre con los ítems).
    const itemsBaseCents = ticketItems.reduce(
      (sum, item) => sum + toCents(item.unit_price) * item.quantity,
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
      // cierran, o un control antifraude de MP sobre el comprador), no una
      // falla nuestra. Antes se cortaba acá con un 400 y el intento se
      // perdía sin dejar rastro (nunca llegaba a `persistCardPayment`); ahora
      // se devuelve como un rechazo más, con su propio `payment` guardado,
      // para poder ver en la base cuántas veces pasa y a quién.
      if (status !== null && status >= 400 && status < 500) {
        const code = extractApiErrorCode(message);
        return {
          mpPaymentId: '',
          status: PaymentStatus.REJECTED,
          mpStatus: 'rejected',
          statusDetail: `${API_ERROR_STATUS_PREFIX}${code ?? 'unknown'}`,
          amount: Number(order.total),
          currency: order.currency,
          paymentMethod: card.paymentMethodId,
          paymentType: null,
          installments: card.installments,
          paidAt: null,
          rawResponse: { message, status, cause: detail } as unknown as Record<string, unknown>
        };
      }

      throw error;
    }
  }

  /**
   * Trae un contracargo de la API de MP (`BR-SUPPORT-004`).
   *
   * Por `fetch` y no por el SDK: la librería no expone el recurso `chargebacks`.
   * Nunca se confía en el contenido de la notificación — el estado y el plazo
   * salen siempre de esta consulta.
   *
   * Lanza ante un error de red o un 5xx para que BullMQ reintente. Un 404
   * devuelve `null`: ese contracargo no es de esta cuenta y reintentarlo no lo
   * va a cambiar.
   */
  async fetchChargeback(chargebackId: string): Promise<MPChargebackResult | null> {
    const accessToken = this.envService.get('MERCADOPAGO_ACCESS_TOKEN');
    if (!accessToken) {
      throw new Error('MERCADOPAGO_ACCESS_TOKEN no configurado: no se puede consultar el contracargo');
    }

    const response = await fetch(`https://api.mercadopago.com/v1/chargebacks/${chargebackId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (response.status === 404) {
      this.logger.warn(`Contracargo ${chargebackId} no encontrado en MP (404)`);
      return null;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`MP respondió ${response.status} al consultar el contracargo ${chargebackId}: ${body}`);
    }

    const data = (await response.json()) as Record<string, any>;
    const payments = Array.isArray(data.payments) ? data.payments : [];
    const toDate = (value: unknown): Date | null => {
      if (!value) return null;
      const date = new Date(String(value));
      return Number.isNaN(date.getTime()) ? null : date;
    };

    return {
      mpChargebackId: String(data.id ?? chargebackId),
      mpPaymentId: payments.length ? String(payments[0]) : null,
      amount: Number(data.amount ?? 0),
      currency: String(data.currency_id ?? 'ARS'),
      status: String(data.status ?? 'unknown'),
      documentationRequired: Boolean(data.documentation_required),
      documentationStatus: data.documentation_status ? String(data.documentation_status) : null,
      documentationDeadline: toDate(data.date_documentation_deadline),
      coverageApplied: Boolean(data.coverage_applied),
      createdAt: toDate(data.date_created),
      raw: data
    };
  }

  /**
   * Id de la cuenta (collector) dueña del `MERCADOPAGO_ACCESS_TOKEN`. MP lo
   * exige como header `X-Caller-Id` al subir evidencia de un contracargo; se
   * pide por API en vez de guardarlo en `.env` porque así nunca queda
   * desincronizado con el token que efectivamente está configurado.
   */
  private async fetchCollectorId(accessToken: string): Promise<string> {
    const response = await fetch('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`MP respondió ${response.status} al consultar la cuenta (users/me): ${body}`);
    }

    const data = (await response.json()) as { id?: number | string };
    if (data.id == null) {
      throw new Error('MP no devolvió un id de cuenta en users/me');
    }
    return String(data.id);
  }

  /**
   * Sube evidencia (facturas, capturas, comprobantes) para un contracargo
   * (`BR-SUPPORT-004`). `POST /v1/chargebacks/{id}/documentation`, multipart,
   * hasta 10 archivos / 10MB entre todos (JPEG, PNG o PDF — lo valida MP, acá
   * solo se pasan tal cual llegaron del controller).
   *
   * `X-Idempotency-Key` nueva en cada llamado a propósito: cada envío de
   * evidencia es un evento distinto, no un reintento del mismo — MP no debe
   * deduplicarlos entre sí.
   */
  async submitChargebackDocumentation(
    chargebackId: string,
    files: { buffer: Buffer; filename: string; mimetype: string }[]
  ): Promise<{ type: string; uuid: string; url: string; description: string }[]> {
    const accessToken = this.envService.get('MERCADOPAGO_ACCESS_TOKEN');
    if (!accessToken) {
      throw new Error('MERCADOPAGO_ACCESS_TOKEN no configurado: no se puede subir evidencia');
    }

    const collectorId = await this.fetchCollectorId(accessToken);

    const form = new FormData();
    for (const file of files) {
      form.append(
        'file',
        new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
        file.filename
      );
    }

    const response = await fetch(`https://api.mercadopago.com/v1/chargebacks/${chargebackId}/documentation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Caller-Id': collectorId,
        'X-Idempotency-Key': randomUUID()
      },
      body: form
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new BadRequestException(`MP rechazó la evidencia del contracargo ${chargebackId} (${response.status}): ${body}`);
    }

    return (await response.json()) as { type: string; uuid: string; url: string; description: string }[];
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
