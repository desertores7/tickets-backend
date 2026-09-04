import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserAuth } from '@root/shared/auth/decorator/user-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import { IOrgCatalogService } from '../services/contracts/iorg-catalog.service';
import {
  CreateManualItemRequest,
  ManualItemResponse,
  ManualItemsResponse,
  MpCatalogItemResponse,
  MpCatalogResponse,
  UpdateManualItemRequest
} from './dtos/catalog.dto';

/**
 * Catálogo de la productora (FP11 §3 / `BR-CASH-002`).
 *
 * Dos orígenes: lo copiado desde Mercado Pago (solo lectura) y los ítems que
 * carga la productora a mano. Ambos son org-wide: todos los eventos ven lo mismo.
 */
@ApiTags('Productora — Catálogo')
@Controller({ path: 'organizations/me', version: '1' })
export class OrgCatalogController {
  constructor(@Inject('IOrgCatalogService') private readonly catalogService: IOrgCatalogService) {}

  @UserAuth(null, MpCatalogResponse)
  @ApiOperation({
    summary: 'Listar catálogo de Mercado Pago',
    description:
      'Products copied from the connected Mercado Pago accounts. Read-only: it is refreshed with ' +
      'the "Actualizar catálogo" action, never automatically (`BR-CASH-002`).'
  })
  @HttpCode(200)
  @Get('mp-catalog')
  async listMpCatalog(@User() loggedUser: string): Promise<MpCatalogResponse> {
    const items = await this.catalogService.listMpCatalog(loggedUser);
    return new MpCatalogResponse(items.map(i => new MpCatalogItemResponse(i)));
  }

  @UserAuth(null, ManualItemsResponse)
  @ApiOperation({
    summary: 'Listar ítems manuales',
    description: 'Organization-wide: every event of the producer sees the same items.'
  })
  @ApiQuery({
    name: 'onlyActive',
    required: false,
    description: 'true to exclude items marked as inactive.'
  })
  @HttpCode(200)
  @Get('manual-items')
  async listManualItems(
    @User() loggedUser: string,
    @Query('onlyActive') onlyActive?: string
  ): Promise<ManualItemsResponse> {
    const items = await this.catalogService.listManualItems(loggedUser, onlyActive === 'true');
    return new ManualItemsResponse(items.map(i => new ManualItemResponse(i)));
  }

  @UserAuth(CreateManualItemRequest, ManualItemResponse)
  @ApiOperation({ summary: 'Crear ítem manual' })
  @HttpCode(201)
  @Post('manual-items')
  async createManualItem(
    @User() loggedUser: string,
    @Body() body: CreateManualItemRequest
  ): Promise<ManualItemResponse> {
    return new ManualItemResponse(await this.catalogService.createManualItem(loggedUser, body));
  }

  @UserAuth(UpdateManualItemRequest, ManualItemResponse)
  @ApiOperation({
    summary: 'Actualizar ítem manual',
    description:
      'Changing the reference price does NOT alter incomes already registered (`BR-CASH-002`).'
  })
  @ApiParam({ name: 'itemUuid' })
  @HttpCode(200)
  @Patch('manual-items/:itemUuid')
  async updateManualItem(
    @User() loggedUser: string,
    @Param('itemUuid') itemUuid: string,
    @Body() body: UpdateManualItemRequest
  ): Promise<ManualItemResponse> {
    return new ManualItemResponse(
      await this.catalogService.updateManualItem(loggedUser, itemUuid, body)
    );
  }

  @UserAuth(null, null)
  @ApiOperation({
    summary: 'Eliminar ítem manual',
    description: 'Logical delete: incomes already registered keep referencing the product.'
  })
  @ApiParam({ name: 'itemUuid' })
  @HttpCode(204)
  @Delete('manual-items/:itemUuid')
  async deleteManualItem(
    @User() loggedUser: string,
    @Param('itemUuid') itemUuid: string
  ): Promise<void> {
    await this.catalogService.deleteManualItem(loggedUser, itemUuid);
  }
}
