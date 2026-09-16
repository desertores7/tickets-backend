import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminAuth } from '@root/shared/auth/decorator/admin-auth.decorator';
import {
  ApiPagination,
  IPaginationParams,
  PaginationParams
} from '@root/shared/decorators/pagination-query.decorator';
import { ChargebackService, TChargebackFilters } from '../services/implementation/chargeback.service';
import {
  ChargebackResponse,
  GetChargebacksResponse,
  UpdateChargebackNotesRequest
} from './dtos/chargeback.dto';

/**
 * Bandeja de contracargos (`BR-SUPPORT-004`). Solo Admin: es plata de la
 * plataforma, no de la productora.
 */
@ApiTags('Admin — Contracargos')
@Controller('admin/chargebacks')
export class ChargebackController {
  constructor(private readonly chargebackService: ChargebackService) {}

  @AdminAuth(null, GetChargebacksResponse)
  @ApiOperation({
    summary: 'Listar contracargos',
    description:
      'Disputes opened by buyers with their bank, as reported by MercadoPago. Open ones first, ' +
      'newest first within that. `openCount` counts every open dispute, not just this page.'
  })
  @ApiPagination()
  @ApiQuery({ name: 'status', required: false, description: 'Estado de Mercado Pago.' })
  @ApiQuery({ name: 'open', required: false, description: '`1` para ver solo los abiertos.' })
  @ApiQuery({ name: 'search', required: false, description: 'Id de contracargo de Mercado Pago.' })
  @HttpCode(200)
  @Get()
  async list(
    @PaginationParams() pagination: IPaginationParams,
    @Query() filters: TChargebackFilters
  ): Promise<GetChargebacksResponse> {
    const [result, openCount] = await Promise.all([
      this.chargebackService.list(filters, pagination),
      this.chargebackService.countOpen()
    ]);
    return new GetChargebacksResponse({ ...result, openCount });
  }

  @AdminAuth(null, ChargebackResponse)
  @ApiOperation({
    summary: 'Obtener contracargo',
    description: 'Full detail of one dispute, with its order, event and buyer when we could link them.'
  })
  @ApiParam({ name: 'uuid' })
  @HttpCode(200)
  @Get(':uuid')
  async getDetail(@Param('uuid', new ParseUUIDPipe()) uuid: string): Promise<ChargebackResponse> {
    return new ChargebackResponse(await this.chargebackService.getDetail(uuid));
  }

  @AdminAuth(UpdateChargebackNotesRequest, ChargebackResponse)
  @ApiOperation({
    summary: 'Actualizar notas del contracargo',
    description:
      'Internal notes only. Status, amount and deadline come from MercadoPago and are never edited here.'
  })
  @ApiParam({ name: 'uuid' })
  @HttpCode(200)
  @Patch(':uuid/notes')
  async updateNotes(
    @Param('uuid', new ParseUUIDPipe()) uuid: string,
    @Body() body: UpdateChargebackNotesRequest
  ): Promise<ChargebackResponse> {
    return new ChargebackResponse(
      await this.chargebackService.updateNotes(uuid, body.internalNotes ?? null)
    );
  }
}
