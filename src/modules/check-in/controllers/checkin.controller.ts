import { Body, Controller, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { User } from '@root/shared/auth/decorator/user.decorator';
import { ValidatorAuth } from '@root/shared/auth/decorator/validator-auth.decorator';
import { ICheckInService } from '../services/contracts/icheckin.service';
import { ValidateQrRequest } from './dtos/validate-qr.request';
import { ValidateQrResponse } from './dtos/validate-qr.response';
import {
  EventCounterResponse,
  FindByDocumentRequest,
  ManualCheckInRequest,
  TicketByDocumentResponse,
  ValidatorEventResponse
} from './dtos/validator-app.dto';

@ApiTags('Check-In')
@Controller('check-in')
export class CheckInController {
  constructor(@Inject('ICheckInService') private readonly checkInService: ICheckInService) {}

  // ---------------------------------------------------------------------------
  // POST /api/check-in/validate
  // ---------------------------------------------------------------------------

  @ValidatorAuth(ValidateQrRequest, ValidateQrResponse)
  @ApiOperation({
    summary: 'Validate ticket QR code',
    description:
      'Validates a ticket QR code for event entry. Requires the `Validador` or `Administrador` role.\n\n' +
      'Optimised for low latency (<200 ms). A Redis lock prevents two validators from ' +
      'simultaneously accepting the same QR code — the first request acquires the lock and ' +
      'marks the ticket as `used` in a MySQL transaction; concurrent duplicates are returned ' +
      'as `already_used` immediately.\n\n' +
      '**Possible results (field `result` in response body):**\n' +
      '- `success` — Valid ticket, entry granted. Ticket status set to `used`.\n' +
      '- `already_used` — Ticket was already scanned (DB check or Redis race-condition guard).\n' +
      '- `invalid` — QR code does not match any registered ticket.\n' +
      '- `wrong_event` — Ticket exists but belongs to a different event.\n' +
      '- `outside_window` — Scanned outside the allowed window: check-in opens at 00:00 of the event ' +
      'start date and closes at `endDate` (so a show running past midnight still accepts entries).\n\n' +
      '> Note: every outcome returns **HTTP 200**. The `success` field and `result` enum ' +
      'indicate the business outcome.'
  })
  @ApiResponse({
    status: 200,
    type: ValidateQrResponse,
    description:
      'Validation completed. Inspect `success` and `result` in the body — ' +
      '`success: false` does **not** mean an HTTP error.'
  })
  @ApiResponse({ status: 400, description: 'Validation error — missing or malformed `qrCode` / `eventId`.' })
  @ApiResponse({ status: 401, description: 'JWT token missing, invalid or expired.' })
  @ApiResponse({ status: 403, description: 'Authenticated user does not have the `Validador` or `Administrador` role.' })
  @HttpCode(200)
  @Post('validate')
  async validateQr(
    @Body() body: ValidateQrRequest,
    @User() userId: string
  ): Promise<ValidateQrResponse> {
    const result = await this.checkInService.validateQr(
      body.qrCode,
      body.eventId,
      userId,
      body.deviceInfo
    );
    return new ValidateQrResponse(result);
  }

  @ValidatorAuth(null, ValidatorEventResponse)
  @ApiOperation({
    summary: 'My events for the working day',
    description:
      'Events assigned to the logged-in validator whose check-in window is open or opens today. ' +
      'Overnight is covered: an event that started yesterday 22:00 and ends today 06:00 still ' +
      'shows up at 02:00, because it has not finished yet. Single joined query with explicit ' +
      'columns — this is the screen the validator opens at the door.'
  })
  @HttpCode(200)
  @Get('my-events')
  async getMyEventsToday(@User() userId: string): Promise<ValidatorEventResponse[]> {
    const events = await this.checkInService.getMyEventsToday(userId);
    return events.map(e => new ValidatorEventResponse(e));
  }

  @ValidatorAuth(FindByDocumentRequest, TicketByDocumentResponse)
  @ApiOperation({
    summary: 'Find tickets by document',
    description:
      'Manual check-in path (`BR-QR-002`): for when the QR fails or the buyer phone is dead. ' +
      'The document is normalised to digits, so it can be typed with dots. Capped at 20 rows.'
  })
  @ApiResponse({ status: 403, description: 'No access to this event.' })
  @HttpCode(200)
  @Post('find-by-document')
  async findByDocument(
    @Body() body: FindByDocumentRequest,
    @User() userId: string
  ): Promise<TicketByDocumentResponse[]> {
    const tickets = await this.checkInService.findTicketsByDocument(
      body.eventId,
      body.document,
      userId
    );
    return tickets.map(t => new TicketByDocumentResponse(t));
  }

  @ValidatorAuth(ManualCheckInRequest, ValidateQrResponse)
  @ApiOperation({
    summary: 'Manual check-in by ticket',
    description:
      'Confirms entry for a ticket already identified by document (`BR-QR-002`). Shares the exact ' +
      'same path as the QR scan — same window, same Redis lock, same transaction and log — so the ' +
      'two ways in cannot diverge.\n\n' +
      'As with `validate`, `success: false` is not an HTTP error: inspect `result`.'
  })
  @HttpCode(200)
  @Post('manual')
  async manualCheckIn(
    @Body() body: ManualCheckInRequest,
    @User() userId: string
  ): Promise<ValidateQrResponse> {
    const result = await this.checkInService.checkInManually(
      body.ticketUuid,
      body.eventId,
      userId,
      body.deviceInfo
    );
    return new ValidateQrResponse(result);
  }

  @ValidatorAuth(null, EventCounterResponse)
  @ApiOperation({
    summary: 'Live entry counter for the event',
    description:
      'Aggregated across ALL access points, not per scanner (`BR-QR-003`). Served from a Redis ' +
      'counter incremented on every successful check-in: with several validators refreshing at ' +
      'the door, a COUNT per request would be the way to saturate the database. If the key is ' +
      'missing it is seeded from the database once.'
  })
  @ApiParam({ name: 'eventId' })
  @HttpCode(200)
  @Get('counter/:eventId')
  async getCounter(
    @Param('eventId') eventId: string,
    @User() userId: string
  ): Promise<EventCounterResponse> {
    return new EventCounterResponse(await this.checkInService.getEventCounter(eventId, userId));
  }
}
