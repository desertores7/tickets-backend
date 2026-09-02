import { Body, Controller, Get, HttpCode, Inject, Param, Put } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserAuth } from '@root/shared/auth/decorator/user-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import { IEventCashService } from '../services/contracts/ievent-cash.service';
import {
  EventMpAccountResponse,
  EventMpAccountsResponse,
  SetEventMpAccountsRequest
} from './dtos/income.dto';

/**
 * Cuentas de Mercado Pago asignadas al evento (FP11 §4 / `BR-CASH-010`).
 *
 * 0–N por evento. **Cero es válido**: ese evento solo registra ingresos
 * manuales. Con una o más, los movimientos de esas cuentas durante la ventana
 * del evento quedan ligados a él.
 */
@ApiTags('Producer — Caja')
@Controller({ path: 'events/:eventUuid/mp-accounts', version: '1' })
export class EventMpAccountController {
  constructor(
    @Inject('IEventCashService') private readonly eventCashService: IEventCashService
  ) {}

  @UserAuth(null, EventMpAccountsResponse)
  @ApiOperation({
    summary: 'MP accounts of the organization, flagged for this event',
    description:
      'Returns every connected account of the organization with `assigned` telling whether it is ' +
      'linked to this event. The screen is a selector, so it also needs the available ones.'
  })
  @ApiParam({ name: 'eventUuid' })
  @HttpCode(200)
  @Get()
  async list(
    @Param('eventUuid') eventUuid: string,
    @User() loggedUser: string
  ): Promise<EventMpAccountsResponse> {
    const items = await this.eventCashService.listMpAccounts(eventUuid, loggedUser);
    return new EventMpAccountsResponse(items.map(i => new EventMpAccountResponse(i)));
  }

  @UserAuth(SetEventMpAccountsRequest, EventMpAccountsResponse)
  @ApiOperation({
    summary: 'Replace the assigned MP accounts',
    description:
      'PUT because the selector sends the final set, not a diff. An empty array unassigns them all, ' +
      'which is a valid configuration (BR-CASH-010).'
  })
  @ApiParam({ name: 'eventUuid' })
  @HttpCode(200)
  @Put()
  async set(
    @Param('eventUuid') eventUuid: string,
    @Body() body: SetEventMpAccountsRequest,
    @User() loggedUser: string
  ): Promise<EventMpAccountsResponse> {
    const items = await this.eventCashService.setMpAccounts(
      eventUuid,
      body.orgMpAccountUuids,
      loggedUser
    );
    return new EventMpAccountsResponse(items.map(i => new EventMpAccountResponse(i)));
  }
}
