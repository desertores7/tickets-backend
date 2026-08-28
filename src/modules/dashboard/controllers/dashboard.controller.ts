import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BackofficeAuth } from '@root/shared/auth/decorator/backoffice-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import { GetBackofficeDashboardResponse } from './dtos/get-backoffice-dashboard/get-backoffice-dashboard.response';
import { DashboardService } from '../services/implementation/dashboard.service';

@ApiTags('Backoffice')
@Controller('backoffice')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @BackofficeAuth(null, GetBackofficeDashboardResponse)
  @ApiOperation({
    summary: 'Dashboard unificado de backoffice',
    description:
      'KPIs y secciones según el rol activo del usuario (Productor, Administrador o Caja). BR-REPORT-001: Productor y Caja no reciben montos de costo de servicio.'
  })
  @ApiResponse({ status: 200, type: GetBackofficeDashboardResponse })
  @Get('dashboard')
  async getDashboard(@User() userUuid: string): Promise<GetBackofficeDashboardResponse> {
    return this.dashboardService.getBackofficeDashboard(userUuid);
  }
}
