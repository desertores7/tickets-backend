import { Controller, Get, HttpCode, Inject, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAuth } from '@root/shared/auth/decorator/user-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import { UserRole } from '@root/shared/auth/decorator/user-role.decorator';
import {
  ApiPagination,
  IPaginationParams,
  PaginationParams
} from '@root/shared/decorators/pagination-query.decorator';
import { IReportingService, ISalesFilters } from '../services/contracts/ireporting.service';
import { ISalesExportService } from '../services/contracts/isales-export.service';
import { GetSalesResponse, SaleDetailResponse, SalesRowResponse } from './responses/reporting.response';

/**
 * Ruta bajo `/producer` y no `/events/sales` a propósito: es la que declara el
 * mapa de API del spec (`29`) y contra la que escribe el frontend oficial.
 * Coincidir importa más que la convención por recurso — cuando no coincidieron,
 * el dashboard quedó llamando a un 404.
 */
@ApiTags('Producer — Reporting')
@Controller('producer')
export class ProducerSalesController {
  constructor(
    @Inject('IReportingService') private readonly reportingService: IReportingService,
    @Inject('ISalesExportService') private readonly exportService: ISalesExportService
  ) {}

  @UserAuth(null, GetSalesResponse)
  @ApiOperation({
    summary: 'List sales (producer)',
    description:
      'Paginated sales table. One row per purchased ticket type (order_item).\n\n' +
      '**BR-REPORT-001**: `amount` is the ticket value only — the service fee is never selected ' +
      'nor returned. A `Productor` only sees events of their organizations; an `Administrador` sees all.'
  })
  @ApiPagination()
  @ApiQuery({ name: 'search', required: false, description: 'Buyer name/email or order number.' })
  @ApiQuery({ name: 'eventUuid', required: false })
  @ApiQuery({
    name: 'organizationUuid',
    required: false,
    description: 'Solo Administrador: acota las ventas a los eventos de una productora.'
  })
  @ApiQuery({ name: 'ticketTypeUuid', required: false })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'YYYY-MM-DD, inclusive.' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'YYYY-MM-DD, inclusive (end of day).' })
  @ApiQuery({ name: 'status', required: false, example: 'paid' })
  @HttpCode(200)
  @Get('sales')
  async getSales(
    @PaginationParams() pagination: IPaginationParams,
    @User() loggedUser: string,
    @UserRole() role: string | null,
    @Query() query: ISalesFilters
  ): Promise<GetSalesResponse> {
    const result = await this.reportingService.getSales(loggedUser, role, query, pagination);
    return new GetSalesResponse(result.items.map(i => new SalesRowResponse(i)), result.meta);
  }

  @UserAuth(null, null)
  @ApiOperation({
    summary: 'Export sales',
    description:
      'Downloads the filtered sales as `xlsx` or `pdf`. Same filters as the listing, no pagination.\n\n' +
      'Generated in the backend so both frontends export identical files and the service-fee rule ' +
      'lives in one place.'
  })
  @ApiQuery({ name: 'format', required: false, enum: ['xlsx', 'pdf'] })
  @ApiResponse({ status: 200, description: 'Binary file.' })
  @Get('sales/export')
  async exportSales(
    @User() loggedUser: string,
    @UserRole() role: string | null,
    @Query() query: ISalesFilters & { format?: string },
    @Res() res: Response
  ): Promise<void> {
    const rows = await this.reportingService.getAllSalesForExport(loggedUser, role, query);
    const format = query.format === 'pdf' ? 'pdf' : 'xlsx';
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === 'pdf') {
      const pdf = await this.exportService.toPdf(rows);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="ventas-${stamp}.pdf"`);
      res.send(pdf);
      return;
    }

    const xlsx = await this.exportService.toExcel(rows);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="ventas-${stamp}.xlsx"`);
    res.send(xlsx);
  }

  @UserAuth(null, SaleDetailResponse)
  @ApiOperation({
    summary: 'Sale detail (producer)',
    description:
      'Full detail of one order: buyer, event, purchased ticket types and payment data.\n\n' +
      '**BR-REPORT-001**: `serviceFee` and `total` are only returned to an `Administrador`. ' +
      'An order outside the caller scope answers 404, not 403.'
  })
  @ApiParam({ name: 'orderUuid', description: 'Order UUID, from the sales listing.' })
  @ApiResponse({ status: 404, description: 'Sale not found or out of scope.' })
  @HttpCode(200)
  @Get('sales/:orderUuid')
  async getSaleDetail(
    @Param('orderUuid') orderUuid: string,
    @User() loggedUser: string,
    @UserRole() role: string | null
  ): Promise<SaleDetailResponse> {
    const detail = await this.reportingService.getSaleDetail(loggedUser, role, orderUuid);
    return new SaleDetailResponse(detail);
  }
}
