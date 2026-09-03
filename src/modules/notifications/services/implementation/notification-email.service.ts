import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { EnvService } from '@config/env/env.service';
import { renderEmailTemplate } from '@root/shared/email/compile-template';
import { EMAIL_TEMPLATES } from '@root/shared/email/resolve-templates-path';
import { EMAIL_BRAND } from '@root/shared/auth/const/email-brand';

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
 * Templates en `src/shared/email/templates/` (Handlebars).
 */
@Injectable()
export class NotificationEmailService {
  private readonly logger = new Logger(NotificationEmailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly envService: EnvService) {}

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

  private async sendTemplate(
    templateName: string,
    params: SendOrderTicketsEmailParams
  ): Promise<void> {
    const { to, subject, templateData, attachments } = params;

    const html = renderEmailTemplate(templateName, {
      appName: EMAIL_BRAND.appName,
      year: new Date().getFullYear(),
      ...templateData
    });

    await this.getTransporter().sendMail({
      from: this.getFromAddress(),
      to,
      subject,
      html,
      attachments
    });
  }

  async sendOrderTicketsEmail(params: SendOrderTicketsEmailParams): Promise<void> {
    await this.sendTemplate(EMAIL_TEMPLATES.ticketEmail, params);
    this.logger.log(`Order tickets email sent to ${params.to} (${params.attachments.length} attachments)`);
  }

  /** Email con template Handlebars (sin adjuntos). */
  async sendTemplateEmail(params: {
    templateName: string;
    to: string;
    subject: string;
    templateData: Record<string, unknown>;
  }): Promise<void> {
    await this.sendTemplate(params.templateName, {
      to: params.to,
      subject: params.subject,
      templateData: params.templateData,
      attachments: []
    });
    this.logger.log(`Template email "${params.templateName}" sent to ${params.to}`);
  }

  /** Texto plano (soporte / alertas operativas) */
  async sendPlainEmail(params: {
    to: string;
    subject: string;
    text: string;
    replyTo?: string;
  }): Promise<void> {
    await this.getTransporter().sendMail({
      from: this.getFromAddress(),
      to: params.to,
      subject: params.subject,
      text: params.text,
      replyTo: params.replyTo
    });
    this.logger.log(`Plain email sent to ${params.to}: ${params.subject}`);
  }
}
