import { Injectable, Logger } from '@nestjs/common';
import { EnvService } from '@config/env/env.service';
import { NotificationEmailService } from '@modules/notifications/services/implementation/notification-email.service';
import { ISupportContactData, ISupportService } from '../contracts/isupport.service';

const TYPE_LABELS: Record<ISupportContactData['type'], string> = {
  problema_compra: 'Problema con una compra',
  no_recibi_entrada: 'No recibí mi entrada',
  consulta_evento: 'Consulta sobre un evento',
  otro: 'Otro'
};

@Injectable()
export class SupportService implements ISupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly envService: EnvService,
    private readonly notificationEmailService: NotificationEmailService
  ) {}

  async contact(data: ISupportContactData): Promise<{ message: string }> {
    const supportTo =
      this.envService.get('SUPPORT_EMAIL') ||
      this.envService.get('SMTP_FROM_EMAIL') ||
      this.envService.get('SMTP_USER') ||
      this.envService.get('USERNAME_EMAIL');

    const subject = `[Soporte] ${TYPE_LABELS[data.type]} — ${data.email}`;
    const text = [
      `Tipo: ${TYPE_LABELS[data.type]} (${data.type})`,
      `Email: ${data.email}`,
      data.userUuid ? `User UUID: ${data.userUuid}` : null,
      '',
      'Mensaje:',
      data.message
    ]
      .filter(Boolean)
      .join('\n');

    if (!supportTo) {
      this.logger.warn(
        `Support contact received but no SUPPORT_EMAIL/SMTP configured. From=${data.email} type=${data.type}`
      );
      this.logger.log(text);
      return { message: 'Consulta recibida' };
    }

    try {
      await this.notificationEmailService.sendPlainEmail({
        to: supportTo,
        subject,
        text,
        replyTo: data.email
      });
    } catch (error) {
      // Anti-bloqueo local: si SMTP falla, logueamos y respondemos OK.
      this.logger.error(
        `Failed to send support email (responding 200 anyway): ${(error as Error).message}`
      );
      this.logger.log(text);
    }

    return { message: 'Consulta recibida' };
  }
}
