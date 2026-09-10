import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAuth } from '@root/shared/auth/decorator/user-auth.decorator';
import { AdminAuth } from '@root/shared/auth/decorator/admin-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import { UserRole } from '@root/shared/auth/decorator/user-role.decorator';
import { ApiSearch, ISearchParams, SearchParams } from '@root/shared/decorators/search-query.decorator';
import { ApiFilter, FilterParams, IFiltersParams } from '@root/shared/decorators/filter-query.decorator';
import { REFUND_KINDS, RefundKind, RefundRequestStatus } from '@config/db/entities/tickets/refund_request.entity';
import { IRefundService } from '../services/contracts/irefund.service';
import { refundFilters } from './const/refund.filters';
import {
  CreateRefundRequest,
  RefundEligibilityResponse,
  RefundRequestResponse,
  RefundRequestsResponse
} from './dtos/refund.dto';

/** Un `kind` desconocido cae al canal de siempre en vez de romper la request. */
function normalizeKind(value: string | undefined): RefundKind {
  return REFUND_KINDS.includes(value as RefundKind) ? (value as RefundKind) : 'material_change';
}

/**
 * Reembolsos (`BR-REFUND-001` a `011`).
 *
 * Dos canales sobre la misma tabla: política propia por cambio material del
 * evento, y el botón de arrepentimiento, que es un derecho legal y no depende
 * de que el productor haya cambiado nada (`BR-REFUND-007`).
 *
 * El pedido nace **siempre desde la cuenta del comprador**, nunca por email a
 * soporte (`BR-REFUND-002`). Después lo resuelve un cron, sin cola humana.
 */
@Controller({ path: 'refunds', version: '1' })
export class RefundController {
  constructor(@Inject('IRefundService') private readonly refundService: IRefundService) {}

  @UserAuth(null, RefundEligibilityResponse)
  @ApiOperation({
    summary: 'Obtener elegibilidad de una orden',
    description:
      'Qué entradas se pueden reembolsar y hasta cuándo. Solo el comprador original.\n\n' +
      'Hay **dos canales** y se evalúan por separado, según `kind`:\n' +
      '- `material_change` (default): política propia. Solo si el evento tuvo un cambio material ' +
      'comunicado y la ventana sigue abierta (`BR-REFUND-010`).\n' +
      '- `withdrawal`: botón de arrepentimiento (`BR-REFUND-007`). No depende del productor, ' +
      'pero exige estar dentro de los 10 días corridos desde la compra **y** a más de 24 horas ' +
      'del inicio del evento.\n\n' +
      'Cada entrada trae su `blockedReason` cuando no se puede pedir — usada, transferida, o ya ' +
      'con una solicitud en curso.'
  })
  @ApiParam({ name: 'orderUuid', description: 'UUID de la orden.' })
  @ApiQuery({
    name: 'kind',
    required: false,
    enum: REFUND_KINDS,
    description: 'Canal a evaluar. Por defecto `material_change`.'
  })
  @ApiResponse({ status: 200, type: RefundEligibilityResponse })
  @ApiResponse({ status: 403, description: 'No sos el comprador de esta orden' })
  @HttpCode(200)
  @ApiTags('Compra — Reembolsos')
  @Get('orders/:orderUuid/eligibility')
  async getEligibility(
    @Param('orderUuid') orderUuid: string,
    @User() loggedUser: string,
    @Query('kind') kind?: string
  ): Promise<RefundEligibilityResponse> {
    return new RefundEligibilityResponse(
      await this.refundService.getEligibility(orderUuid, loggedUser, normalizeKind(kind))
    );
  }

  @UserAuth(CreateRefundRequest, RefundRequestResponse)
  @ApiOperation({
    summary: 'Crear solicitud de reembolso',
    description:
      'Pide el reembolso de una o varias entradas de la orden. Queda en cola para el cron, que ' +
      'aprueba o rechaza y avisa por email (`BR-REFUND-004`).\n\n' +
      'El monto es la suma del valor de esas entradas: **el costo de servicio nunca se devuelve**, ' +
      'tampoco en el arrepentimiento (`BR-REFUND-006`). `kind` elige el canal; por defecto ' +
      '`material_change`.\n\n' +
      'Se puede pedir más de una vez sobre la misma orden mientras queden entradas disponibles.'
  })
  @ApiParam({ name: 'orderUuid', description: 'UUID de la orden.' })
  @ApiResponse({ status: 201, type: RefundRequestResponse })
  @ApiResponse({ status: 400, description: 'Fuera de plazo, entradas no disponibles o monto cero' })
  @HttpCode(201)
  @ApiTags('Compra — Reembolsos')
  @Post('orders/:orderUuid')
  async createRequest(
    @Param('orderUuid') orderUuid: string,
    @Body() body: CreateRefundRequest,
    @User() loggedUser: string
  ): Promise<RefundRequestResponse> {
    return new RefundRequestResponse(
      await this.refundService.createRequest(
        orderUuid,
        body.ticketUuids,
        loggedUser,
        normalizeKind(body.kind)
      )
    );
  }

  @UserAuth(null, RefundRequestsResponse)
  @ApiOperation({
    summary: 'Listar mis solicitudes',
    description: 'Las solicitudes de reembolso del usuario autenticado, con su estado actual.'
  })
  @ApiResponse({ status: 200, type: RefundRequestsResponse })
  @HttpCode(200)
  @ApiTags('Compra — Reembolsos')
  @Get('mine')
  async listMine(@User() loggedUser: string): Promise<RefundRequestsResponse> {
    const items = await this.refundService.listMine(loggedUser);
    return new RefundRequestsResponse(items.map(i => new RefundRequestResponse(i)));
  }

  @UserAuth(null, RefundRequestsResponse)
  @ApiOperation({
    summary: 'Listar solicitudes de la productora',
    description:
      'Solicitudes de los eventos de la organización, para el tab Reembolsos.\n\n' +
      '- `search`: comprador, email, número de orden, evento o número de entrada.\n' +
      '- `status`: pending, approved, processing, refunded, rejected, failed.\n' +
      '- `eventUuid`: acotar a un evento.\n' +
      '- `dateFrom` / `dateTo`: fecha de solicitud (YYYY-MM-DD, inclusive).'
  })
  @ApiSearch()
  @ApiFilter(refundFilters)
  @ApiResponse({ status: 200, type: RefundRequestsResponse })
  @HttpCode(200)
  @ApiTags('Productora — Reembolsos')
  @Get()
  async listForProducer(
    @SearchParams() search: ISearchParams,
    @FilterParams(refundFilters) filters: IFiltersParams<typeof refundFilters>,
    @User() loggedUser: string,
    @UserRole() role: string | null
  ): Promise<RefundRequestsResponse> {
    const items = await this.refundService.listForProducer(
      {
        eventUuid: filters.eventUuid?.[0],
        status: filters.status?.[0] as RefundRequestStatus | undefined,
        dateFrom: filters.dateFrom?.[0],
        dateTo: filters.dateTo?.[0],
        search: search.search
      },
      loggedUser,
      role
    );
    return new RefundRequestsResponse(items.map(i => new RefundRequestResponse(i)));
  }

  @AdminAuth(null, RefundRequestResponse)
  @ApiOperation({
    summary: 'Reintentar reembolso fallido',
    description:
      'Vuelve a ejecutar el reintegro de una solicitud en `failed`. **Solo Administrador y solo a ' +
      'mano**: un reintento sobre un refund que en realidad salió devuelve el dinero dos veces, ' +
      'así que el cron nunca reintenta (`BR-REFUND-011`).\n\n' +
      'Antes de usarlo, verificar en el panel de Mercado Pago con el `uniqueSequenceNumber` de la ' +
      'solicitud. La llamada viaja con idempotency key, pero la verificación sigue siendo la ' +
      'primera defensa.'
  })
  @ApiParam({ name: 'requestUuid', description: 'UUID de la solicitud.' })
  @ApiResponse({ status: 200, type: RefundRequestResponse })
  @ApiResponse({ status: 400, description: 'La solicitud no está en estado fallido' })
  @HttpCode(200)
  @ApiTags('Admin — Reembolsos')
  @Post(':requestUuid/retry')
  async retryFailed(
    @Param('requestUuid') requestUuid: string,
    @User() loggedUser: string
  ): Promise<RefundRequestResponse> {
    return new RefundRequestResponse(
      await this.refundService.retryFailed(requestUuid, loggedUser)
    );
  }
}
