import { Body, Controller, Get, HttpCode, Put } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminAuth } from '@root/shared/auth/decorator/admin-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import { MaxPerBuyerConfigService } from '../services/implementation/max-per-buyer-config.service';
import {
  MaxPerBuyerConfigResponse,
  UpdateMaxPerBuyerConfigRequest
} from './dtos/max-per-buyer/max-per-buyer-config.dto';

/**
 * Tope de compra por comprador por defecto (`ticket_type.maxPerBuyer` sin
 * override): lo decide el precio de la entrada frente a un umbral, los dos
 * configurables por el Administrador.
 *
 * Sin `@ApiTags` de clase: la lectura es pública (la usa el checkout para
 * mostrar el tope antes de comprar) y el resto es de Admin.
 */
@Controller()
export class MaxPerBuyerController {
  constructor(private readonly maxPerBuyerConfig: MaxPerBuyerConfigService) {}

  @ApiTags('Compra — Órdenes')
  @ApiOperation({
    summary: 'Obtener tope de compra por comprador vigente',
    description:
      'Public. Umbral de precio y los dos topes por defecto (alto y bajo). Una tanda con `maxPerBuyer` ' +
      'propio (ver `TicketType`) usa ese valor en vez de este default.'
  })
  @ApiResponse({ status: 200, type: MaxPerBuyerConfigResponse })
  @HttpCode(200)
  @Get('max-per-buyer/config')
  async getConfig(): Promise<MaxPerBuyerConfigResponse> {
    return new MaxPerBuyerConfigResponse(await this.maxPerBuyerConfig.getConfig());
  }

  @ApiTags('Admin — Tope de compra')
  @AdminAuth(UpdateMaxPerBuyerConfigRequest, MaxPerBuyerConfigResponse)
  @ApiOperation({
    summary: 'Actualizar tope de compra por comprador — umbral y topes',
    description:
      'Applies to every ticket type without its own `maxPerBuyer` override, for orders created from ' +
      'now on.'
  })
  @HttpCode(200)
  @Put('admin/max-per-buyer/config')
  async updateConfig(
    @Body() body: UpdateMaxPerBuyerConfigRequest,
    @User() loggedUser: string
  ): Promise<MaxPerBuyerConfigResponse> {
    return new MaxPerBuyerConfigResponse(
      await this.maxPerBuyerConfig.updateConfig(
        {
          priceThreshold: body.priceThreshold,
          highPriceLimit: body.highPriceLimit,
          lowPriceLimit: body.lowPriceLimit
        },
        loggedUser
      )
    );
  }
}
