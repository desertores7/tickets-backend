import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { EmailConfig, SendEmailOptions } from '../const/email';
import { EMAIL_BRAND } from '../const/email-brand';
import { EnvService } from '@config/env/env.service';
import { DBRepository } from '@config/db/db.repository';
import { IsNull } from 'typeorm';
import { renderEmailTemplate } from '@root/shared/email/compile-template';
import { EMAIL_TEMPLATES } from '@root/shared/email/resolve-templates-path';

@Injectable()
export class EmailService {
  private transporter: Transporter;
  private emailConfig: EmailConfig;

  constructor(
    private envService: EnvService,
    @Inject(DBRepository) private dbRepository: DBRepository
  ) {}

  private async loadEmailConfig(): Promise<void> {
    if (this.emailConfig) {
      return;
    }
    const dataEmail = {
      host: this.envService.get('HOST_EMAIL'),
      port: this.envService.get('PORT_EMAIL'),
      username: this.envService.get('USERNAME_EMAIL'),
      password: this.envService.get('PASSWORD_EMAIL')
    };

    if (!dataEmail) {
      throw new BadRequestException('Email config not found. Please configure SMTP settings first.');
    }

    this.emailConfig = dataEmail as EmailConfig;
  }

  async initializeSmtp(): Promise<void> {
    const smtpFromDb = await this.dbRepository.findOne({
      entity: 'email',
      where: { isDeleted: IsNull() },
      other: {
        order: { createdAt: 'DESC' }
      }
    });

    if (smtpFromDb) {
      await this.mailWithCredentials({
        host: smtpFromDb.host,
        port: smtpFromDb.port,
        user: smtpFromDb.user,
        password: smtpFromDb.password
      });
      return;
    }

    await this.mailFromEnv();
  }

  async mailFromEnv(): Promise<void> {
    await this.loadEmailConfig();
    const port = this.envService.get('PORT_EMAIL');
    const transportConfig = {
      host: this.envService.get('HOST_EMAIL'),
      port,
      secure: port === 465,
      auth: {
        user: this.envService.get('USERNAME_EMAIL'),
        pass: this.envService.get('PASSWORD_EMAIL')
      },
      tls: {
        rejectUnauthorized: false
      }
    };

    this.transporter = nodemailer.createTransport(transportConfig);

    try {
      await this.transporter.verify();
      console.log('✅ SMTP connection verified successfully');
    } catch (error) {
      console.error('❌ SMTP connection failed:', error);
      throw new BadRequestException(`SMTP connection failed: ${error.message}`);
    }
  }

  /** @deprecated Use initializeSmtp() instead */
  async mail(): Promise<void> {
    await this.initializeSmtp();
  }

  async mailWithCredentials(data: {
    host: string;
    port: string | number;
    user: string;
    password: string;
  }): Promise<void> {
    this.emailConfig = {
      host: data.host,
      port: Number(data.port),
      username: data.user,
      password: data.password
    } as EmailConfig;

    const transportConfig = {
      host: data.host,
      port: Number(data.port),
      secure: Number(data.port) === 465,
      auth: {
        user: data.user,
        pass: data.password
      },
      tls: {
        rejectUnauthorized: false
      }
    };

    this.transporter = nodemailer.createTransport(transportConfig);

    try {
      await this.transporter.verify();
    } catch (error) {
      throw new BadRequestException(`SMTP connection failed: ${error.message}`);
    }
  }

  getFromAddress(displayName?: string): string {
    if (!this.emailConfig) {
      throw new BadRequestException('Email service not initialized. Call mail() first.');
    }

    const name = displayName || EMAIL_BRAND.appName;
    return `"${name}" <${this.emailConfig.username}>`;
  }

  getFromEmail(): string {
    if (!this.emailConfig) {
      throw new BadRequestException('Email service not initialized. Call mail() first.');
    }
    return this.emailConfig.username!;
  }

  async send(options: SendEmailOptions): Promise<void> {
    if (!this.transporter) {
      await this.initializeSmtp();
    }

    try {
      const fromAddress = options.from || this.getFromAddress();
      const mailOptions = {
        from: fromAddress,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('✅ Email sent successfully!');

      return result;
    } catch (error) {
      throw new BadRequestException(`Failed to send email: ${error.message}`);
    }
  }

  async verify(): Promise<boolean> {
    await this.loadEmailConfig();

    if (!this.transporter) {
      throw new BadRequestException('Email service not initialized. Call mail() first.');
    }

    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('SMTP verification failed:', error);
      return false;
    }
  }

  async getEmailConfig(): Promise<any> {
    await this.loadEmailConfig();
    return this.emailConfig;
  }

  async sendTemplateEmail(
    templateName: string,
    data: Record<string, unknown>,
    options: Omit<SendEmailOptions, 'html'>
  ): Promise<void> {
    let html: string;
    try {
      html = renderEmailTemplate(templateName, this.withBrand(data));
    } catch (error) {
      throw new BadRequestException(`Template ${templateName} not found: ${(error as Error).message}`);
    }

    await this.send({
      ...options,
      html
    });
  }

  private getFrontendUrl(): string {
    return (this.envService.get('FRONTEND_URL') || 'http://localhost:3000').replace(/\/$/, '');
  }

  private withBrand(data: Record<string, unknown>): Record<string, unknown> {
    return {
      appName: EMAIL_BRAND.appName,
      appTagline: EMAIL_BRAND.appTagline,
      supportEmail: EMAIL_BRAND.supportEmail,
      frontendUrl: this.getFrontendUrl(),
      year: new Date().getFullYear(),
      ...data
    };
  }

  async sendNewUserEmail(data: { firstName: string; lastName: string; email: string }): Promise<void> {
    const loginUrl = `${this.getFrontendUrl()}/login`;

    await this.sendTemplateEmail(
      EMAIL_TEMPLATES.welcomeNewUser,
      {
        preheader: `Bienvenido a Ticketera, ${data.firstName}. Tu cuenta ya está activa.`,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        loginUrl
      },
      {
        to: data.email,
        subject: `¡Bienvenido a Ticketera, ${data.firstName}!`,
        text: `Hola ${data.firstName} ${data.lastName}, tu cuenta en Ticketera ya está activa. Ingresá en: ${loginUrl}`
      }
    );
  }

  async sendResetPasswordEmail(data: { firstName: string; email: string; code: string }): Promise<void> {
    await this.sendTemplateEmail(
      EMAIL_TEMPLATES.resetPasswordCode,
      {
        preheader: `Tu código para restablecer la contraseña es ${data.code}`,
        firstName: data.firstName,
        code: data.code
      },
      {
        to: data.email,
        subject: 'Restablecer contraseña — Ticketera',
        text: `Hola ${data.firstName}, tu código para restablecer la contraseña es ${data.code}. Expira en 15 minutos.`
      }
    );
  }

  async sendLoginCodeEmail(data: { firstName: string; email: string; code: string }): Promise<void> {
    await this.sendTemplateEmail(
      EMAIL_TEMPLATES.login2faCode,
      {
        preheader: `Tu código de acceso a Ticketera es ${data.code}`,
        firstName: data.firstName,
        code: data.code
      },
      {
        to: data.email,
        subject: 'Código de validación de acceso — Ticketera',
        text: `Hola ${data.firstName}, tu código de acceso es ${data.code}. Expira en 5 minutos.`
      }
    );
  }

  async sendRegistrationEmail(data: { firstName: string; email: string; validationUrl: string }): Promise<void> {
    await this.sendTemplateEmail(
      EMAIL_TEMPLATES.registrationWelcome,
      {
        preheader: 'Gracias por registrarte en Ticketera. Verificá tu email para empezar.',
        firstName: data.firstName,
        validationUrl: data.validationUrl
      },
      {
        to: data.email,
        subject: 'Bienvenido a Ticketera — verificá tu email',
        text: `Hola ${data.firstName}, gracias por registrarte en Ticketera. Verificá tu email en: ${data.validationUrl}`
      }
    );
  }

  async sendEmailVerifiedEmail(data: { firstName: string; email: string }): Promise<void> {
    const loginUrl = `${this.getFrontendUrl()}/login`;

    await this.sendTemplateEmail(
      EMAIL_TEMPLATES.emailVerified,
      {
        preheader: 'Tu correo fue verificado correctamente en Ticketera.',
        firstName: data.firstName,
        loginUrl
      },
      {
        to: data.email,
        subject: 'Correo verificado correctamente — Ticketera',
        text: `Hola ${data.firstName}, tu correo fue verificado. Iniciá sesión en: ${loginUrl}`
      }
    );
  }

  async sendOrganizationApprovedEmail(data: {
    firstName: string;
    email: string;
    organizationName: string;
  }): Promise<void> {
    const dashboardUrl = `${this.getFrontendUrl()}/producer/dashboard`;

    await this.sendTemplateEmail(
      EMAIL_TEMPLATES.organizationApproved,
      {
        preheader: `${data.organizationName} fue aprobada. Ya podés crear eventos.`,
        firstName: data.firstName,
        organizationName: data.organizationName,
        dashboardUrl
      },
      {
        to: data.email,
        subject: `Productora aprobada — ${data.organizationName}`,
        text: `Hola ${data.firstName}, la productora ${data.organizationName} fue aprobada. Ingresá en: ${dashboardUrl}`
      }
    );
  }

  async sendOrganizationRejectedEmail(data: {
    firstName: string;
    email: string;
    organizationName: string;
    rejectionReason: string;
  }): Promise<void> {
    const fiscalUrl = `${this.getFrontendUrl()}/producer/organization/fiscal`;

    await this.sendTemplateEmail(
      EMAIL_TEMPLATES.organizationRejected,
      {
        preheader: `La validación de ${data.organizationName} fue rechazada.`,
        firstName: data.firstName,
        organizationName: data.organizationName,
        rejectionReason: data.rejectionReason,
        fiscalUrl
      },
      {
        to: data.email,
        subject: `Validación rechazada — ${data.organizationName}`,
        text: `Hola ${data.firstName}, la productora ${data.organizationName} no fue aprobada. Motivo: ${data.rejectionReason}. Corregí los datos en: ${fiscalUrl}`
      }
    );
  }
}
