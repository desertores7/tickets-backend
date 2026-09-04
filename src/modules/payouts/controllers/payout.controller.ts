import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { createReadStream } from 'fs';
import { ApiConsumes, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AdminAuth } from '@root/shared/auth/decorator/admin-auth.decorator';
import { UserAuth } from '@root/shared/auth/decorator/user-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import { ApiSearch, ISearchParams, SearchParams } from '@root/shared/decorators/search-query.decorator';
import { ApiFilter, FilterParams, IFiltersParams } from '@root/shared/decorators/filter-query.decorator';
import {
  ApiPagination,
  IPaginationParams,
  PaginationParams
} from '@root/shared/decorators/pagination-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { IPayoutService, PayoutFileKind } from '../services/contracts/ipayout.service';
import { payoutFilters } from './const/payout.filters';
import {
  CreatePayoutRequest,
  PayoutBlocksResponse,
  PayoutEventBlockResponse,
  PayoutResponse
} from './dtos/payout.dto';

function applyDownloadHeaders(res: Response, mimeType: string, originalName: string): void {
  const safeName = originalName.replace(/[^\w.\- ()]/gi, '_').slice(0, 180);
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', 'attachment; filename="' + safeName + '"');
  res.setHeader('Cache-Control', 'private, no-store');
}

/**
 * Liquidaciones de la productora (FP03 §8 / BR-PAY-005 / BR-REPORT-003).
 *
 * El Productor solo lee: es el comprobante de una transferencia ya hecha. El
 * alta y los archivos los carga el Administrador, en el controlador de abajo.
 */
@ApiTags('Productora — Liquidaciones')
@Controller({ path: 'organizations/me/payouts', version: '1' })
export class ProducerPayoutController {
  constructor(@Inject('IPayoutService') private readonly payoutService: IPayoutService) {}

  @UserAuth(null, PayoutBlocksResponse)
  @ApiOperation({
    summary: 'Listar mis liquidaciones — agrupadas por evento',
    description:
      'One block per event with its payouts. A payout belongs to exactly one event and an event ' +
      'can have several (BR-PAY-005). Amounts exclude the service fee. Supports `search` (event name), ' +
      'filters `eventUuid`, `status` (complete|pending), and pagination (`page`, `limit`; default 10).'
  })
  @ApiSearch()
  @ApiFilter(payoutFilters)
  @ApiPagination()
  @HttpCode(200)
  @Get()
  async listMine(
    @User() loggedUser: string,
    @SearchParams() search: ISearchParams,
    @FilterParams(payoutFilters) filters: IFiltersParams<typeof payoutFilters>,
    @PaginationParams() pagination: IPaginationParams
  ): Promise<PayoutBlocksResponse> {
    const result = await this.payoutService.listMyPayouts(loggedUser, search, filters, pagination);
    return new PayoutBlocksResponse(
      result.items.map(b => new PayoutEventBlockResponse(b)),
      result.eventOptions,
      new PaginationMetaResponse({
        total: result.total ?? 0,
        page: result.page ?? pagination.page,
        limit: result.limit ?? pagination.limit
      })
    );
  }

  @UserAuth(null, PayoutResponse)
  @ApiOperation({ summary: 'Obtener liquidación' })
  @ApiParam({ name: 'payoutUuid' })
  @HttpCode(200)
  @Get(':payoutUuid')
  async getMine(
    @User() loggedUser: string,
    @Param('payoutUuid') payoutUuid: string
  ): Promise<PayoutResponse> {
    return new PayoutResponse(await this.payoutService.getMyPayout(loggedUser, payoutUuid));
  }

  @UserAuth(null, null)
  @ApiOperation({
    summary: 'Descargar comprobante de transferencia',
    description: 'Private file: served through this authenticated endpoint, never a public URL.'
  })
  @ApiParam({ name: 'payoutUuid' })
  @Get(':payoutUuid/transfer-proof')
  async downloadTransferProof(
    @User() loggedUser: string,
    @Param('payoutUuid') payoutUuid: string,
    @Res({ passthrough: true }) res: Response
  ): Promise<StreamableFile> {
    return this.streamFile(loggedUser, payoutUuid, 'transfer-proof', res);
  }

  @UserAuth(null, null)
  @ApiOperation({
    summary: 'Descargar factura ARCA',
    description: 'Returns 404 while the invoice is still pending (BR-FACT-002).'
  })
  @ApiParam({ name: 'payoutUuid' })
  @Get(':payoutUuid/arca-invoice')
  async downloadArcaInvoice(
    @User() loggedUser: string,
    @Param('payoutUuid') payoutUuid: string,
    @Res({ passthrough: true }) res: Response
  ): Promise<StreamableFile> {
    return this.streamFile(loggedUser, payoutUuid, 'arca-invoice', res);
  }

  private async streamFile(
    loggedUser: string,
    payoutUuid: string,
    kind: PayoutFileKind,
    res: Response
  ): Promise<StreamableFile> {
    const file = await this.payoutService.getMyPayoutFile(loggedUser, payoutUuid, kind);
    applyDownloadHeaders(res, file.mimeType, file.originalName);
    return new StreamableFile(createReadStream(file.absolutePath));
  }
}

/** Alta y archivos de liquidaciones. Solo Administrador (BR-REPORT-003). */
@ApiTags('Admin — Liquidaciones')
@Controller({ path: 'organizations/:organizationUuid/payouts', version: '1' })
export class AdminPayoutController {
  constructor(@Inject('IPayoutService') private readonly payoutService: IPayoutService) {}

  @AdminAuth(null, PayoutBlocksResponse)
  @ApiOperation({ summary: 'Listar liquidaciones de una productora' })
  @ApiParam({ name: 'organizationUuid' })
  @ApiSearch()
  @ApiFilter(payoutFilters)
  @HttpCode(200)
  @Get()
  async list(
    @Param('organizationUuid') organizationUuid: string,
    @SearchParams() search: ISearchParams,
    @FilterParams(payoutFilters) filters: IFiltersParams<typeof payoutFilters>
  ): Promise<PayoutBlocksResponse> {
    const result = await this.payoutService.listOrganizationPayouts(
      organizationUuid,
      search,
      filters
    );
    return new PayoutBlocksResponse(
      result.items.map(b => new PayoutEventBlockResponse(b)),
      result.eventOptions
    );
  }

  @AdminAuth(CreatePayoutRequest, PayoutResponse)
  @ApiOperation({
    summary: 'Registrar liquidación',
    description:
      'Records a transfer that already happened - the payment process itself is manual ' +
      '(BR-PAY-005). The event must belong to the organization.'
  })
  @ApiParam({ name: 'organizationUuid' })
  @HttpCode(201)
  @Post()
  async create(
    @Param('organizationUuid') organizationUuid: string,
    @Body() body: CreatePayoutRequest,
    @User() adminUuid: string
  ): Promise<PayoutResponse> {
    return new PayoutResponse(
      await this.payoutService.createPayout(organizationUuid, body, adminUuid)
    );
  }

  @AdminAuth(null, PayoutResponse)
  @ApiOperation({
    summary: 'Subir comprobante de transferencia',
    description: 'Multipart field `file`. PDF, JPG, PNG or WebP, max 5MB.'
  })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'payoutUuid' })
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(200)
  @Post(':payoutUuid/transfer-proof')
  async uploadTransferProof(
    @Param('payoutUuid') payoutUuid: string,
    @UploadedFile() file: Express.Multer.File
  ): Promise<PayoutResponse> {
    return new PayoutResponse(
      await this.payoutService.uploadPayoutFile(payoutUuid, 'transfer-proof', file)
    );
  }

  @AdminAuth(null, PayoutResponse)
  @ApiOperation({
    summary: 'Subir factura ARCA',
    description:
      'Multipart field `file`. Uploading it moves the payout to `invoice_available`; until then ' +
      'the producer sees it as pending.'
  })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'payoutUuid' })
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(200)
  @Post(':payoutUuid/arca-invoice')
  async uploadArcaInvoice(
    @Param('payoutUuid') payoutUuid: string,
    @UploadedFile() file: Express.Multer.File
  ): Promise<PayoutResponse> {
    return new PayoutResponse(
      await this.payoutService.uploadPayoutFile(payoutUuid, 'arca-invoice', file)
    );
  }

  @AdminAuth(null, null)
  @ApiOperation({
    summary: 'Eliminar liquidación',
    description: 'Logical delete: it is an accounting record and must not vanish from history.'
  })
  @ApiParam({ name: 'payoutUuid' })
  @HttpCode(204)
  @Delete(':payoutUuid')
  async remove(@Param('payoutUuid') payoutUuid: string): Promise<void> {
    await this.payoutService.deletePayout(payoutUuid);
  }
}
