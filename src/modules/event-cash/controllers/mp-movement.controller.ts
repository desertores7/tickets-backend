import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserAuth } from '@root/shared/auth/decorator/user-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import { IEventCashService } from '../services/contracts/ievent-cash.service';
import { IncomeResponse } from './dtos/income.dto';
import {
  CompleteMovementProductsRequest,
  MpMovementResponse,
  MpMovementsResponse,
  UpdateMpMovementRequest
} from './dtos/mp-movement.dto';

/**
 * Movimientos de Mercado Pago del evento (FP11 §5b).
 *
 * Solo lectura y curación: las filas las escribe el job de sincronización
 * (`BR-CASH-003`), que corre durante la ventana del evento sobre las cuentas
 * asignadas. Todo acá es **solo del Productor**: el rol Caja carga ingresos,
 * no toca lo que llegó de MP.
 */
@ApiTags('Producer — Caja')
@Controller({ path: 'events/:eventUuid/mp-movements', version: '1' })
export class MpMovementController {
  constructor(
    @Inject('IEventCashService') private readonly eventCashService: IEventCashService
  ) {}

  @UserAuth(null, MpMovementsResponse)
  @ApiOperation({
    summary: 'List synced MP movements',
    description:
      'Movements copied from the MP accounts assigned to this event during its window ' +
      '(`BR-CASH-003`). Producer only.'
  })
  @ApiParam({ name: 'eventUuid' })
  @HttpCode(200)
  @Get()
  async list(
    @Param('eventUuid') eventUuid: string,
    @User() loggedUser: string
  ): Promise<MpMovementsResponse> {
    const movements = await this.eventCashService.listMpMovements(eventUuid, loggedUser);
    return new MpMovementsResponse(movements.map(m => new MpMovementResponse(m)));
  }

  @UserAuth(UpdateMpMovementRequest, MpMovementResponse)
  @ApiOperation({
    summary: 'Reclassify or reassign a movement',
    description:
      'Producer only. `targetEventUuid` moves the movement to another event of the same ' +
      'organization, and is rejected once the movement already has an income attached.'
  })
  @ApiParam({ name: 'eventUuid' })
  @ApiParam({ name: 'movementUuid' })
  @HttpCode(200)
  @Patch(':movementUuid')
  async update(
    @Param('eventUuid') eventUuid: string,
    @Param('movementUuid') movementUuid: string,
    @Body() body: UpdateMpMovementRequest,
    @User() loggedUser: string
  ): Promise<MpMovementResponse> {
    return new MpMovementResponse(
      await this.eventCashService.updateMpMovement(eventUuid, movementUuid, body, loggedUser)
    );
  }

  @UserAuth(CompleteMovementProductsRequest, IncomeResponse)
  @ApiOperation({
    summary: 'Complete the product detail of a movement',
    description:
      'Creates an `mp_auto` income linked to the movement. It is the breakdown of money that ' +
      'already came in through MP, so the summary does not add it to the total again.'
  })
  @ApiParam({ name: 'eventUuid' })
  @ApiParam({ name: 'movementUuid' })
  @HttpCode(201)
  @Post(':movementUuid/complete-products')
  async completeProducts(
    @Param('eventUuid') eventUuid: string,
    @Param('movementUuid') movementUuid: string,
    @Body() body: CompleteMovementProductsRequest,
    @User() loggedUser: string
  ): Promise<IncomeResponse> {
    return new IncomeResponse(
      await this.eventCashService.completeMovementProducts(
        eventUuid,
        movementUuid,
        body.products,
        loggedUser
      )
    );
  }
}
