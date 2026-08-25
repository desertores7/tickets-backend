import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAuth } from '@root/shared/auth/decorator/user-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import { ISupportService } from '../services/contracts/isupport.service';
import { SupportContactRequest } from './requests/support-contact.request';

@ApiTags('Support')
@Controller({ path: 'support', version: '1' })
export class SupportController {
  constructor(@Inject('ISupportService') private readonly supportService: ISupportService) {}

  @UserAuth(SupportContactRequest, null)
  @ApiOperation({
    summary: 'Contact support',
    description:
      'Sends a support contact form by email (SMTP). If SMTP is not configured, logs the message and still returns 200.'
  })
  @ApiResponse({ status: 200, description: 'Consulta recibida' })
  @HttpCode(200)
  @Post('contact')
  async contact(
    @Body() body: SupportContactRequest,
    @User() userId: string
  ): Promise<{ message: string }> {
    return this.supportService.contact({
      type: body.type,
      message: body.message,
      email: body.email,
      userUuid: userId
    });
  }
}
