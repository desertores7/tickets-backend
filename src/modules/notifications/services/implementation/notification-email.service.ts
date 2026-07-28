import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import * as Handlebars from 'handlebars';
import { EnvService } from '@config/env/env.service';

export interface EmailAttachment {
  filename: string;
  path: string;
}

export interface SendOrderTicketsEmailParams {
  to: string;
  subject: string;
  templateData: Record<string, unknown>;
  attachments: EmailAttachment[];
}

/**
 * Servicio de email transaccional del módulo de notificaciones.
 * Usa las variables SMTP_* (Gmail SMTP con contraseña de aplicación en MVP),
 * con fallback a las variables *_EMAIL legacy si las SMTP_* no están definidas.
 *
 * Gmail SMTP tiene límite de ~500 emails/día — suficiente para MVP,
 * migrar a proveedor transaccional en producción.
 */
@Injectable()
export class NotificationEmailService {
  private readonly logger = new Logger(NotificationEmailService.name);
  private transporter: Transporter | null = null;
  private readonly templatesPath: string;
  private readonly templateCache = new Map<string, HandlebarsTemplateDelegate>();

  constructor(private readonly envService: EnvService) {
    const distTemplates = path.join(__dirname, '..', '..', '..', '..', 'shared', 'auth', 'templates');
    const srcTemplates = path.join(process.cwd(), 'src', 'shared', 'auth', 'templates');
    this.templatesPath = fs.existsSync(path.join(distTemplates, 'ticket-email.hbs')) ? distTemplates : srcTemplates;
  }

  private getSmtpConfig() {
    const host = this.envService.get('SMTP_HOST') ?? this.envService.get('HOST_EMAIL');
    const port = this.envService.get('SMTP_PORT') ?? this.envService.get('PORT_EMAIL') ?? 587;
    const user = this.envService.get('SMTP_USER') ?? this.envService.get('USERNAME_EMAIL');
    const password = this.envService.get('SMTP_PASSWORD') ?? this.envService.get('PASSWORD_EMAIL');
    const secure = this.envService.get('SMTP_SECURE') || Number(port) === 465;

    return { host, port: Number(port), user, password, secure };
  }

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;

    const { host, port, user, password, secure } = this.getSmtpConfig();

    if (!host || !user || !password) {
      throw new Error(
        'SMTP is not configured — set SMTP_HOST/SMTP_USER/SMTP_PASSWORD (or legacy HOST_EMAIL/USERNAME_EMAIL/PASSWORD_EMAIL)'
      );
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass: password }
    });

    return this.transporter;
  }

  private getFromAddress(): string {
    const { user } = this.getSmtpConfig();
    const fromName = this.envService.get('SMTP_FROM_NAME') ?? 'Ticketera';
    const fromEmail = this.envService.get('SMTP_FROM_EMAIL') ?? user;
    return `"${fromName}" <${fromEmail}>`;
  }

  private compileTemplate(templateName: string): HandlebarsTemplateDelegate {
    const cached = this.templateCache.get(templateName);
    if (cached) return cached;

    const templatePath = path.join(this.templatesPath, `${templateName}.hbs`);
    const source = fs.readFileSync(templatePath, 'utf8');
    const compiled = Handlebars.compile(source);
    this.templateCache.set(templateName, compiled);
    return compiled;
  }

  async sendOrderTicketsEmail(params: SendOrderTicketsEmailParams): Promise<void> {
    const { to, subject, templateData, attachments } = params;

    const template = this.compileTemplate('ticket-email');
    const html = template(templateData);

    await this.getTransporter().sendMail({
      from: this.getFromAddress(),
      to,
      subject,
      html,
      attachments
    });

    this.logger.log(`Order tickets email sent to ${to} (${attachments.length} attachments)`);
  }
}
