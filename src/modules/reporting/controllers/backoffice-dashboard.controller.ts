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
 */
@ApiTags('Backoffice')
@Controller({ path: 'backoffice', version: '1' })
export class BackofficeDashboardController {
  constructor(@Inject('IReportingService') private readonly reportingService: IReportingService) {}

  @UserAuth(null, DashboardResponse)
  @ApiOperation({
    summary: 'Backoffice dashboard summary',
    description:
      'Aggregated KPIs (BR-BACKOFFICE-002). Scope depends on the role: a `Productor` gets their ' +
      "organizations' events; an `Administrador` gets all.\n\n" +
      '**BR-REPORT-001**: `webRevenue` excludes the service fee.\n\n' +
      '`cashRevenue` is 0 and `cashModuleAvailable` is false until the Caja module (FP11) exists — ' +
      'the frontend should say so rather than present the total as complete.'
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
