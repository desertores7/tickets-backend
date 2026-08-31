import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiExcludeEndpoint, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserAuth } from '@root/shared/auth/decorator/user-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import { IOrgMpService } from '../services/contracts/iorg-mp.service';
import {
  MpAccountResponse,
  MpAccountsResponse,
  StartMpConnectResponse,
  UpdateMpAccountRequest
} from './dtos/mp-account.dto';

/**
 * Cuentas de Mercado Pago propias de la productora (FP11 §2 / `BR-CASH-001`).
 *
 * Son las cuentas del posnet, independientes de la cuenta de la ticketera que
 * cobra el checkout web — esa vive en `payments/` y no se toca desde acá.
 */
@ApiTags('Producer — Mercado Pago')
@Controller('organizations/me/mp-accounts')
export class OrgMpController {
  constructor(@Inject('IOrgMpService') private readonly orgMpService: IOrgMpService) {}

  @UserAuth(null, MpAccountsResponse)
  @ApiOperation({
    summary: 'List the organization MP accounts',
    description:
      'Includes disconnected accounts: their history stays in the database, so the view has to be ' +
      'able to show where an old movement came from. Tokens are never returned.'
  })
  @HttpCode(200)
  @Get()
  async list(@User() loggedUser: string): Promise<MpAccountsResponse> {
    const accounts = await this.orgMpService.listAccounts(loggedUser);
    return new MpAccountsResponse(accounts.map(a => new MpAccountResponse(a)));
  }

  @UserAuth(null, StartMpConnectResponse)
  @ApiOperation({
    summary: 'Start the OAuth connection',
    description:
      'Returns the Mercado Pago authorization URL. The frontend must redirect the browser there; ' +
      'MP sends the seller back to the callback below.\n\n' +
      'Requires an approved organization (`29` §8b).'
  })
  @HttpCode(200)
  @Post('connect')
  async connect(@User() loggedUser: string): Promise<StartMpConnectResponse> {
    const { authorizationUrl } = await this.orgMpService.startConnect(loggedUser);
    return new StartMpConnectResponse(authorizationUrl);
  }

  /**
   * Callback del OAuth. Es publico a proposito: lo abre el navegador del
   * productor viniendo de Mercado Pago, sin nuestro header de autorizacion. La
   * unica prueba de identidad es el `state` firmado que se emitio en /connect.
   */
  @ApiExcludeEndpoint()
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response
  ): Promise<void> {
    const { redirectUrl } = await this.orgMpService.completeConnect(code, state);
    res.redirect(redirectUrl);
  }

  @UserAuth(UpdateMpAccountRequest, MpAccountResponse)
  @ApiOperation({ summary: 'Rename an account', description: 'Only the internal alias is editable.' })
  @ApiParam({ name: 'accountUuid' })
  @HttpCode(200)
  @Patch(':accountUuid')
  async update(
    @User() loggedUser: string,
    @Param('accountUuid') accountUuid: string,
    @Body() body: UpdateMpAccountRequest
  ): Promise<MpAccountResponse> {
    return new MpAccountResponse(
      await this.orgMpService.updateAlias(loggedUser, accountUuid, body.alias)
    );
  }

  @UserAuth(null, null)
  @ApiOperation({
    summary: 'Disconnect an account',
    description:
      'Clears the stored tokens and marks the account `disconnected`. **It does not delete the ' +
      'history** already copied to the database (`BR-CASH-001`).'
  })
  @ApiParam({ name: 'accountUuid' })
  @HttpCode(204)
  @Delete(':accountUuid')
  async disconnect(
    @User() loggedUser: string,
    @Param('accountUuid') accountUuid: string
  ): Promise<void> {
    await this.orgMpService.disconnect(loggedUser, accountUuid);
  }
}
