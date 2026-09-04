import { Controller, Get, HttpCode, Inject, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserAuth } from '@root/shared/auth/decorator/user-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import { UserRole } from '@root/shared/auth/decorator/user-role.decorator';
import { IReportingService } from '../services/contracts/ireporting.service';
import { EventDashboardResponse } from './responses/reporting.response';

/**
 * `GET /events/:eventUuid/dashboard` — dashboard del evento (`29` §17).
 *
 * Son los KPIs del dashboard general acotados a un evento, y la cuenta de los
 * ingresos operativos es la misma que la del resumen de caja (`BR-CASH-007`):
 * sale de `event-cash`, no se recalcula acá.
 */
@ApiTags('Productora — Reportes')
@Controller({ path: 'events/:eventUuid/dashboard', version: '1' })
export class EventDashboardController {
  constructor(@Inject('IReportingService') private readonly reportingService: IReportingService) {}

  @UserAuth(null, EventDashboardResponse)
  @ApiOperation({
    summary: 'Obtener dashboard del evento',
    description:
      'Aggregated KPIs of one event (`29` §17). Read-only: no expense lines, no per-income ' +
      'products.\n\n' +
      '**BR-REPORT-001**: `webRevenue` excludes the service fee.\n\n' +
      '`cashRevenue` follows BR-CASH-007 and is computed by the Caja module, so this endpoint, ' +
      'the general dashboard and the cash summary cannot disagree.\n\n' +
      'A producer asking for an event of another organization gets 404, not an empty board.'
  })
  @ApiParam({ name: 'eventUuid' })
  @HttpCode(200)
  @Get()
  async getEventDashboard(
    @Param('eventUuid') eventUuid: string,
    @User() loggedUser: string,
    @UserRole() role: string | null
  ): Promise<EventDashboardResponse> {
    return new EventDashboardResponse(
      await this.reportingService.getEventDashboard(eventUuid, loggedUser, role)
    );
  }
}
