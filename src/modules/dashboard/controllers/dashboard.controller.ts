import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BackofficeAuth } from '@root/shared/auth/decorator/backoffice-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import { GetBackofficeDashboardResponse } from './dtos/get-backoffice-dashboard/get-backoffice-dashboard.response';
import { DashboardService } from '../services/implementation/dashboard.service';

/**
 * Home operativo del backoffice (por rol activo).
 *
 * Distinto de `GET /backoffice/dashboard` (reporting): este endpoint resuelve el
 * rol activo en DB, arma quick actions tipados y, para Caja, lista eventos de
 * hoy asignados. El de reporting agrega filtros de fecha, gastos y ventas.
 */
@ApiTags('Backoffice')
@Controller('backoffice')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @BackofficeAuth(null, GetBackofficeDashboardResponse)
  @ApiOperation({
    summary: 'Home unificado de backoffice (por rol activo)',
    description:
      'KPIs y secciones según el rol activo del usuario (Productor, Administrador o Caja). ' +
      'Complementa `GET /backoffice/dashboard` (reporting con filtros de fecha y gastos). ' +
      'BR-REPORT-001: Productor y Caja no reciben montos de costo de servicio.'
  })
  @ApiResponse({ status: 200, type: GetBackofficeDashboardResponse })
  @Get('home')
  async getHome(@User() userUuid: string): Promise<GetBackofficeDashboardResponse> {
    return this.dashboardService.getBackofficeDashboard(userUuid);
  }
}
