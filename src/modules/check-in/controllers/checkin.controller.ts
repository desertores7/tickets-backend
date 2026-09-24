import { Body, Controller, Get, HttpCode, Inject, MessageEvent, Param, Post, Sse } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
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

@ApiTags('Acceso — Check-in')
@Controller('check-in')
export class CheckInController {
  constructor(@Inject('ICheckInService') private readonly checkInService: ICheckInService) {}

  // ---------------------------------------------------------------------------
  // POST /api/check-in/validate
  // ---------------------------------------------------------------------------

  @ValidatorAuth(ValidateQrRequest, ValidateQrResponse)
  @ApiOperation({
    summary: 'Validar QR del ticket',
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
    summary: 'Listar mis eventos de la jornada',
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
    summary: 'Buscar tickets por documento',
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
    summary: 'Registrar ingreso manual',
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

  // Lectura desde Redis, sin efectos secundarios, y pensada justo para que
  // varios validadores del mismo evento (a menudo detras del mismo IP/WiFi
  // del lugar) la golpeen seguido: el limite global por IP (`BR-SEC-001`) no
  // aplica aca — de lo contrario terminaban pisando su propio cupo entre
  // ellos y se veian 429 (`ThrottlerException`) sin haber abusado de nada.
  @SkipThrottle()
  @ValidatorAuth(null, EventCounterResponse)
  @ApiOperation({
    summary: 'Obtener contador de ingresos en vivo',
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

  // ---------------------------------------------------------------------------
  // GET /api/check-in/counter/:eventId/stream (SSE)
  // ---------------------------------------------------------------------------

  // Conexion persistente + reconexion automatica del propio `EventSource`
  // del navegador: si el proxy la corta (buffering, timeout, etc.) el
  // cliente reintenta solo, cada pocos segundos. Sin este skip, esos
  // reintentos —multiplicados por varios validadores en la misma red—
  // agotaban el cupo global y tiraban 429 en vez de simplemente reconectar.
  @SkipThrottle()
  @ValidatorAuth(null, null)
  @ApiOperation({
    summary: 'Contador de ingresos en vivo (SSE)',
    description:
      'Server-Sent Events version of `GET /check-in/counter/:eventId`. Pushes the counter to every ' +
      'connected validator the moment any of them checks a ticket in, instead of each device polling ' +
      'on its own — several doors stay in sync within roughly a second of each other, and this does ' +
      'not change what a scan accepts or rejects: that is still decided fresh against MySQL + a Redis ' +
      'lock on every `POST /check-in/validate`, regardless of what any screen shows.\n\n' +
      'Auth note: the native `EventSource` API cannot send custom headers, so this endpoint also ' +
      'accepts the JWT as `?token=` in the query string (in addition to the usual `Authorization` ' +
      'header, which every other endpoint keeps using exclusively).'
  })
  @ApiParam({ name: 'eventId' })
  @Sse('counter/:eventId/stream')
  streamCounter(@Param('eventId') eventId: string, @User() userId: string): Observable<MessageEvent> {
    return this.checkInService
      .watchEventCounter(eventId, userId)
      .pipe(map(counter => ({ data: new EventCounterResponse(counter) })));
  }
}
