import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Put, Res } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AdminAuth } from '@root/shared/auth/decorator/admin-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import { ServiceFeeReportService } from '@modules/reporting/services/implementation/service-fee-report.service';
import { ServiceFeeConfigService } from '../services/implementation/service-fee-config.service';
import {
  ServiceFeeConfigResponse,
  UpdateServiceFeeConfigRequest
} from './dtos/service-fee/service-fee-config.dto';

/**
 * Costo de servicio (`BR-PAY-002`): 10% por entrada con tope configurable.
 *
 * Sin `@ApiTags` de clase: la lectura es pública (la usa el checkout) y el
 * resto es de Admin.
 */
@Controller()
export class ServiceFeeController {
  constructor(
    private readonly serviceFeeConfig: ServiceFeeConfigService,
    private readonly serviceFeeReport: ServiceFeeReportService
  ) {}

  @ApiTags('Compra — Órdenes')
  @ApiOperation({
    summary: 'Obtener costo de servicio vigente',
    description:
      'Public. Rate and per-ticket cap in force, so the checkout can preview the fee before the order ' +
      'exists. The order itself is always priced by the backend.'
  })
  @ApiResponse({ status: 200, type: ServiceFeeConfigResponse })
  @HttpCode(200)
  @Get('service-fee/config')
  async getConfig(): Promise<ServiceFeeConfigResponse> {
    return new ServiceFeeConfigResponse(await this.serviceFeeConfig.getConfig());
  }

  @ApiTags('Admin — Costo de servicio')
  @AdminAuth(UpdateServiceFeeConfigRequest, ServiceFeeConfigResponse)
  @ApiOperation({
    summary: 'Actualizar costo de servicio — porcentaje y tope',
    description:
      'Applies to every event, for orders created from now on. Orders already created keep the fee ' +
      'they were priced with.'
  })
  @HttpCode(200)
  @Put('admin/service-fee/config')
  async updateConfig(
    @Body() body: UpdateServiceFeeConfigRequest,
    @User() loggedUser: string
  ): Promise<ServiceFeeConfigResponse> {
    return new ServiceFeeConfigResponse(
      await this.serviceFeeConfig.updateConfig(
        { ratePercent: body.ratePercent, cap: body.cap },
        loggedUser
      )
    );
  }

  @ApiTags('Admin — Costo de servicio')
  @AdminAuth(null, null)
  @ApiOperation({
    summary: 'Exportar costo de servicio por entrada — Excel',
    description:
      'Per-ticket service fee charged for an event (paid and refunded orders), with the rule each ' +
      'ticket was charged with. Meant to be handed to the organization.'
  })
  @ApiParam({ name: 'eventUuid' })
  @ApiResponse({ status: 200, description: 'Binary xlsx file.' })
  @ApiResponse({ status: 404, description: 'Event not found.' })
  @Get('admin/service-fee/events/:eventUuid/report')
  async exportReport(
    @Param('eventUuid', new ParseUUIDPipe()) eventUuid: string,
    @Res() res: Response
  ): Promise<void> {
    const { filename, buffer } = await this.serviceFeeReport.buildEventReport(eventUuid);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
