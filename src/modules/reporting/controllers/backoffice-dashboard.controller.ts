import { Controller, Get, HttpCode, Inject, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserAuth } from '@root/shared/auth/decorator/user-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import { UserRole } from '@root/shared/auth/decorator/user-role.decorator';
import { IDashboardFilters, IReportingService } from '../services/contracts/ireporting.service';
import { DashboardResponse } from './responses/reporting.response';

/**
 * `GET /backoffice/dashboard` — la ruta que ya consume el frontend oficial y
 * que declara el mapa de API del spec.
 *
 * Complementa `GET /backoffice/home` (home por rol activo, con eventos de Caja
 * del día). Este endpoint agrega filtros de fecha, gastos y KPIs de reporting.
 */
@ApiTags('Admin — Backoffice')
@Controller('backoffice')
export class BackofficeDashboardController {
  constructor(@Inject('IReportingService') private readonly reportingService: IReportingService) {}

  @UserAuth(null, DashboardResponse)
  @ApiOperation({
    summary: 'Obtener dashboard de backoffice',
    description:
      'Aggregated KPIs (BR-BACKOFFICE-002). Scope depends on the role: a `Productor` gets their ' +
      "organizations' events; an `Administrador` gets all.\n\n" +
      '**BR-REPORT-001**: `webRevenue` excludes the service fee.\n\n' +
      '`cashRevenue` are the operational cash incomes (BR-CASH-007), computed by the Caja ' +
      'module so this endpoint and the per-event dashboard cannot disagree.\n\n' +
      'For the role-based workspace home (incl. Caja today events), see `GET /backoffice/home`.'
  })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'YYYY-MM-DD, inclusive.' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'YYYY-MM-DD, inclusive.' })
  @HttpCode(200)
  @Get('dashboard')
  async getDashboard(
    @User() loggedUser: string,
    @UserRole() role: string | null,
    @Query() query: IDashboardFilters
  ): Promise<DashboardResponse> {
    return new DashboardResponse(
      await this.reportingService.getDashboard(loggedUser, role, query),
      role
    );
  }
}
