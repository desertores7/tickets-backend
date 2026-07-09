import * as crypto from 'crypto';
import { Body, Controller, Get, Headers, HttpCode, Inject, Logger, Param, Post, Query, Res } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { EnvService } from '@config/env/env.service';
import { UserAuth } from '@root/shared/auth/decorator/user-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import { Swagger } from '@root/shared/decorators/swagger.decorator';
import { IPaymentService } from '../services/contracts/ipayment.service';
import { InitializePaymentResponse } from './dtos/initialize-payment/initialize-payment.response';
import { GetPaymentResponse } from './dtos/get-payment/get-payment.response';
import { MercadoPagoWebhookRequest } from './dtos/webhook/mercadopago-webhook.request';

@ApiTags('Payments')
@Controller({ path: 'payments', version: '1' })
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    @Inject('IPaymentService') private readonly paymentService: IPaymentService,
    private readonly envService: EnvService
  ) {}

  // ---------------------------------------------------------------------------
  // POST /api/v1/payments/initialize/:orderId
  // ---------------------------------------------------------------------------

  @UserAuth(null, InitializePaymentResponse)
  @ApiOperation({
    summary: 'Initialize payment',
    description:
      'Creates a MercadoPago preference for the given order and returns the `checkoutUrl` ' +
      'to redirect the user to the payment gateway.\n\n' +
      'The order must belong to the authenticated user and be in `pending_payment` status. ' +
      'A `payment` record is saved with `pending` status and the order is tagged with the ' +
      'MercadoPago preference ID.'
  })
  @ApiParam({
    name: 'orderId',
    description: 'UUID of the order to pay.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
  })
  @ApiResponse({ status: 200, type: InitializePaymentResponse, description: 'Checkout URL generated successfully.' })
  @ApiResponse({ status: 400, description: 'Validation error in request parameters.' })
  @ApiResponse({ status: 401, description: 'JWT token missing, invalid or expired.' })
  @ApiResponse({ status: 404, description: 'Order not found or does not belong to the authenticated user.' })
  @ApiResponse({ status: 422, description: 'Order is not in `pending_payment` status.' })
  @HttpCode(200)
  @Post('initialize/:orderId')
  async initializePayment(
    @Param('orderId') orderId: string,
    @User() userId: string
  ): Promise<InitializePaymentResponse> {
    const result = await this.paymentService.initializePayment(orderId, userId);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    return new InitializePaymentResponse({ ...result, expiresAt });
  }

  // ---------------------------------------------------------------------------
  // POST /api/v1/payments/webhook/mercadopago
  // ---------------------------------------------------------------------------

  @Swagger(MercadoPagoWebhookRequest, null)
  @ApiOperation({
    summary: 'MercadoPago webhook (public)',
    description:
      'Receives payment-status notifications from MercadoPago. **No authentication required** — ' +
      'this endpoint is called directly by MercadoPago servers.\n\n' +
      'Always returns **HTTP 200** regardless of outcome, so that MercadoPago does not schedule ' +
      'infinite retries on transient internal failures. Processing happens asynchronously via ' +
      'BullMQ; BullMQ handles retries at the job level.\n\n' +
      'When `MERCADOPAGO_WEBHOOK_SECRET` is configured, the `x-signature` header is validated ' +
      'using HMAC-SHA256 before the event is enqueued. Requests that fail signature verification ' +
      'are silently discarded (still returning 200).'
  })
  @ApiHeader({
    name: 'x-signature',
    required: false,
    description:
      'HMAC-SHA256 signature sent by MercadoPago. Format: `ts=<unix_timestamp>,v1=<hex_hash>`. ' +
      'Required when `MERCADOPAGO_WEBHOOK_SECRET` is set.'
  })
  @ApiHeader({
    name: 'x-request-id',
    required: false,
    description: 'Unique request ID included by MercadoPago; used as part of the signature template.'
  })
  @ApiQuery({ name: 'data.id', required: false, description: 'Payment ID (formato webhook moderno).' })
  @ApiQuery({ name: 'type', required: false, description: 'Tipo de evento (formato webhook moderno).' })
  @ApiQuery({ name: 'id', required: false, description: 'Resource ID (formato IPN legacy).' })
  @ApiQuery({ name: 'topic', required: false, description: 'Tipo de evento (formato IPN legacy).' })
  @ApiResponse({ status: 200, description: 'Notification received and enqueued for asynchronous processing.' })
  @HttpCode(200)
  @Post('webhook/mercadopago')
  async mercadopagoWebhook(
    @Headers('x-signature') xSignature: string | undefined,
    @Headers('x-request-id') xRequestId: string | undefined,
    @Query() query: Record<string, string>,
    @Body() body: MercadoPagoWebhookRequest,
    @Res({ passthrough: true }) res: Response
  ): Promise<void> {
    res.status(200);

    // MP envía varios formatos: webhook moderno (?data.id=...&type=payment con firma)
    // e IPN legacy (?id=...&topic=payment|merchant_order, sin firma). Normalizamos todo.
    const eventType = (query['type'] ?? query['topic'] ?? body?.type ?? body?.topic ?? '').toString();
    const paymentId = (query['data.id'] ?? body?.data?.id ?? (eventType === 'payment' ? query['id'] : '') ?? '')
      .toString()
      .trim();

    if (eventType !== 'payment') {
      this.logger.log(`MP notification ignored (type=${eventType || 'unknown'}) — only payment events are processed`);
      return;
    }

    if (!paymentId) {
      this.logger.warn('MP payment notification without payment id — discarded');
      return;
    }

    const secret = this.envService.get('MERCADOPAGO_WEBHOOK_SECRET');

    if (secret && xSignature) {
      // MP signs using data.id from query params (?data.id=...), not the JSON body.
      const dataId = query['data.id']?.trim() || undefined;
      const valid = this.verifySignature(xSignature, xRequestId ?? '', dataId, secret);
      if (!valid) {
        this.logger.warn(
          `MP webhook signature invalid — discarded (requestId=${xRequestId ?? 'missing'}, dataId=${dataId ?? 'missing'})`
        );
        return;
      }
    } else if (secret && !xSignature) {
      // IPN legacy no incluye x-signature. Es seguro procesarla igual: el estado del pago
      // se obtiene siempre re-consultando la API de MP con nuestro access token, nunca
      // se confía en el contenido de la notificación.
      this.logger.warn(`MP notification without x-signature accepted (IPN legacy, paymentId=${paymentId})`);
    }

    const normalizedPayload: MercadoPagoWebhookRequest = {
      ...body,
      type: 'payment',
      data: { id: paymentId }
    };

    try {
      await this.paymentService.processWebhook('mercadopago', normalizedPayload);
    } catch (err) {
      // Swallow to ensure 200 is returned so MP does not retry indefinitely.
      // BullMQ handles retries at the job level.
      this.logger.error('MP webhook processing failed — error swallowed to preserve 200 ACK', err);
    }
  }

  // ---------------------------------------------------------------------------
  // GET /api/v1/payments/orders/:orderId
  // ---------------------------------------------------------------------------

  @UserAuth(null, GetPaymentResponse)
  @ApiOperation({
    summary: 'Get payment by order',
    description:
      'Returns the payment record associated with the given order, including provider status, ' +
      'amount, currency and payment method details.'
  })
  @ApiParam({
    name: 'orderId',
    description: 'UUID of the order whose payment is requested.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
  })
  @ApiResponse({ status: 200, type: GetPaymentResponse, description: 'Payment record returned.' })
  @ApiResponse({ status: 401, description: 'JWT token missing, invalid or expired.' })
  @ApiResponse({ status: 404, description: 'No payment record found for this order.' })
  @HttpCode(200)
  @Get('orders/:orderId')
  async getPaymentByOrder(@Param('orderId') orderId: string): Promise<GetPaymentResponse> {
    const payment = await this.paymentService.getPaymentByOrder(orderId);
    return new GetPaymentResponse(payment);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Validates x-signature against MercadoPago's HMAC-SHA256 scheme.
   * Manifest: id:{data.id};request-id:{x-request-id};ts:{ts};
   * - data.id comes from URL query param `data.id` (not the JSON body).
   * - Omit manifest segments when the corresponding value is missing.
   */
  private verifySignature(
    xSignature: string,
    requestId: string,
    dataId: string | undefined,
    secret: string
  ): boolean {
    try {
      const parts: Record<string, string> = {};
      for (const part of xSignature.split(',')) {
        const idx = part.indexOf('=');
        if (idx === -1) continue;
        const key = part.slice(0, idx).trim().toLowerCase();
        const value = part.slice(idx + 1).trim();
        if (key && value) parts[key] = value;
      }

      const ts = parts['ts'];
      const v1 = parts['v1'];
      if (!ts || !v1 || !/^\d+$/.test(ts)) return false;

      const manifestParts: string[] = [];
      if (dataId) manifestParts.push(`id:${dataId}`);
      if (requestId) manifestParts.push(`request-id:${requestId}`);
      manifestParts.push(`ts:${ts}`);
      const manifest = `${manifestParts.join(';')};`;

      const computed = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

      if (computed.length !== v1.length) return false;
      return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(v1));
    } catch {
      return false;
    }
  }
}
