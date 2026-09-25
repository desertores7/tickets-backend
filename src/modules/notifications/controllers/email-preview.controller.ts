import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminAuth } from '@root/shared/auth/decorator/admin-auth.decorator';
import { EmailPreviewService } from '../services/implementation/email-preview.service';
import { SendEmailPreviewsRequest } from './dtos/send-email-previews/send-email-previews.request';
import { SendEmailPreviewsResponse } from './responses/send-email-previews.response';

@Controller('notifications/email-previews')
export class EmailPreviewController {
  constructor(private readonly emailPreviewService: EmailPreviewService) {}

  @ApiTags('Admin — Notificaciones')
  @AdminAuth(SendEmailPreviewsRequest, SendEmailPreviewsResponse)
  @ApiOperation({
    summary: 'Enviar previsualización de todos los emails',
    description:
      'Manda a la casilla indicada una copia de cada diseño de email que usa la plataforma (alta y acceso de ' +
      'cliente, compra de entradas, cambios de evento y reembolsos, alta y validación de productora, invitaciones ' +
      'de equipo y avisos internos a administradores), todos con datos ficticios. Pensado para revisar de una sola ' +
      'pasada cómo se ven los diseños en un cliente de correo real (Gmail). Solo Administrador.'
  })
  @ApiResponse({ status: 201, type: SendEmailPreviewsResponse })
  @HttpCode(201)
  @Post()
  async sendAll(@Body() body: SendEmailPreviewsRequest): Promise<SendEmailPreviewsResponse> {
    const results = await this.emailPreviewService.sendAll(body.email);
    return new SendEmailPreviewsResponse(body.email, results);
  }
}
