import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { User } from '@root/shared/auth/decorator/user.decorator';
import { ValidatorAuth } from '@root/shared/auth/decorator/validator-auth.decorator';
import { ICheckInService } from '../services/contracts/icheckin.service';
import { ValidateQrRequest } from './dtos/validate-qr.request';
import { ValidateQrResponse } from './dtos/validate-qr.response';

@ApiTags('Check-In')
@Controller({ path: 'check-in', version: '1' })
export class CheckInController {
  constructor(@Inject('ICheckInService') private readonly checkInService: ICheckInService) {}

  // ---------------------------------------------------------------------------
  // POST /api/v1/check-in/validate
  // ---------------------------------------------------------------------------

  @ValidatorAuth(ValidateQrRequest, ValidateQrResponse)
  @ApiOperation({
    summary: 'Validate ticket QR code',
    description:
      'Validates a ticket QR code for event entry. Requires the `validador` or `admin` role.\n\n' +
      'Optimised for low latency (<200 ms). A Redis lock prevents two validators from ' +
      'simultaneously accepting the same QR code — the first request acquires the lock and ' +
      'marks the ticket as `used` in a MySQL transaction; concurrent duplicates are returned ' +
      'as `already_used` immediately.\n\n' +
      '**Possible results (field `result` in response body):**\n' +
      '- `success` — Valid ticket, entry granted. Ticket status set to `used`.\n' +
      '- `already_used` — Ticket was already scanned (DB check or Redis race-condition guard).\n' +
      '- `invalid` — QR code does not match any registered ticket.\n' +
      '- `wrong_event` — Ticket exists but belongs to a different event.\n\n' +
      '> Note: all four outcomes return **HTTP 200**. The `success` field and `result` enum ' +
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
  @ApiResponse({ status: 403, description: 'Authenticated user does not have the `validador` or `admin` role.' })
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
}
