import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OptionalUserAuth } from '@root/shared/auth/decorator/optional-user-auth.decorator';
import { OptionalUser } from '@root/shared/auth/decorator/optional-user.decorator';
import { ISupportService } from '../services/contracts/isupport.service';
import { SupportContactRequest } from './requests/support-contact.request';

@ApiTags('Support')
@Controller('support')
export class SupportController {
  constructor(@Inject('ISupportService') private readonly supportService: ISupportService) {}

  @OptionalUserAuth(SupportContactRequest, null)
  @ApiOperation({
    summary: 'Contact support',
    description:
      'Sends a support contact form by email (SMTP). Public; if the user is logged in, the message is linked to their account. If SMTP is not configured, logs the message and still returns 200.'
  })
  @ApiResponse({ status: 200, description: 'Consulta recibida' })
  @HttpCode(200)
  @Post('contact')
  async contact(
    @Body() body: SupportContactRequest,
    @OptionalUser() userId: string | null
  ): Promise<{ message: string }> {
    return this.supportService.contact({
      type: body.type,
      message: body.message,
      email: body.email,
      userUuid: userId ?? undefined
    });
  }
}
