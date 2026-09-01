import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Put } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { UserAuth } from '@root/shared/auth/decorator/user-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import {
  IStockAlert,
  IStockAlertService
} from '../services/contracts/istock-alert.service';

/** Sin constructor: `plainToInstance` instancia los request sin argumentos. */
export class UpsertStockAlertRequest {
  @IsUUID()
  @ApiProperty({ description: 'Tanda a vigilar' })
  ticketTypeUuid: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({
    description: 'Umbral "queda poco". Null para avisar solo al agotarse.',
    example: 20
  })
  lowThreshold?: number | null;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ description: 'Si es true, el umbral es un porcentaje del stock total' })
  thresholdIsPercent?: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ default: true })
  notifySoldOut?: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ default: true })
  active?: boolean;
}

export class StockAlertResponse {
  @ApiProperty() uuid: string;
  @ApiProperty() ticketTypeUuid: string;
  @ApiProperty() ticketTypeName: string;
  @ApiProperty({ nullable: true }) lowThreshold: number | null;
  @ApiProperty() thresholdIsPercent: boolean;
  @ApiProperty() notifySoldOut: boolean;
  @ApiProperty() active: boolean;

  @ApiProperty({ nullable: true, description: 'Cuándo se avisó "queda poco". ISO-8601' })
  lowNotifiedAt: string | null;

  @ApiProperty({ nullable: true, description: 'Cuándo se avisó agotado. ISO-8601' })
  soldOutNotifiedAt: string | null;

  @ApiProperty() availableQuantity: number;
  @ApiProperty() totalQuantity: number;

  constructor(data: IStockAlert) {
    this.uuid = data.uuid;
    this.ticketTypeUuid = data.ticketTypeUuid;
    this.ticketTypeName = data.ticketTypeName;
    this.lowThreshold = data.lowThreshold;
    this.thresholdIsPercent = data.thresholdIsPercent;
    this.notifySoldOut = data.notifySoldOut;
    this.active = data.active;
    this.lowNotifiedAt = data.lowNotifiedAt ? new Date(data.lowNotifiedAt).toISOString() : null;
    this.soldOutNotifiedAt = data.soldOutNotifiedAt
      ? new Date(data.soldOutNotifiedAt).toISOString()
      : null;
    this.availableQuantity = data.availableQuantity;
    this.totalQuantity = data.totalQuantity;
  }
}

export class StockAlertsResponse {
  @ApiProperty({ type: [StockAlertResponse] }) items: StockAlertResponse[];
  constructor(items: StockAlertResponse[]) {
    this.items = items;
  }
}

/**
 * Alertas de stock por tanda (FP05 §14 / BR-EVENT-017).
 *
 * El tono de los avisos es de felicitación: agotar una tanda es que el evento
 * vende bien, no una crisis.
 */
@ApiTags('Producer — Alertas de stock')
@Controller({ path: 'events/:eventUuid/stock-alerts', version: '1' })
export class StockAlertController {
  constructor(
    @Inject('IStockAlertService') private readonly stockAlertService: IStockAlertService
  ) {}

  @UserAuth(null, StockAlertsResponse)
  @ApiOperation({ summary: 'List stock alerts of the event' })
  @ApiParam({ name: 'eventUuid' })
  @HttpCode(200)
  @Get()
  async list(
    @Param('eventUuid') eventUuid: string,
    @User() loggedUser: string
  ): Promise<StockAlertsResponse> {
    const alerts = await this.stockAlertService.listByEvent(eventUuid, loggedUser);
    return new StockAlertsResponse(alerts.map(a => new StockAlertResponse(a)));
  }

  @UserAuth(UpsertStockAlertRequest, StockAlertResponse)
  @ApiOperation({
    summary: 'Create or update the alert of a ticket type',
    description:
      'PUT because there is at most one alert per ticket type: two configurations would only ' +
      'duplicate the notices. Changing the configuration rearms the notice.'
  })
  @ApiParam({ name: 'eventUuid' })
  @HttpCode(200)
  @Put()
  async upsert(
    @Param('eventUuid') eventUuid: string,
    @Body() body: UpsertStockAlertRequest,
    @User() loggedUser: string
  ): Promise<StockAlertResponse> {
    return new StockAlertResponse(
      await this.stockAlertService.upsert(eventUuid, body, loggedUser)
    );
  }

  @UserAuth(null, null)
  @ApiOperation({ summary: 'Delete a stock alert' })
  @ApiParam({ name: 'eventUuid' })
  @ApiParam({ name: 'alertUuid' })
  @HttpCode(204)
  @Delete(':alertUuid')
  async remove(
    @Param('eventUuid') eventUuid: string,
    @Param('alertUuid') alertUuid: string,
    @User() loggedUser: string
  ): Promise<void> {
    await this.stockAlertService.remove(eventUuid, alertUuid, loggedUser);
  }
}
