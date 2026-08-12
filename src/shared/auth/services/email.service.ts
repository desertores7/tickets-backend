import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import * as Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import { EmailConfig, SendEmailOptions } from '../const/email';
import {
  EMAIL_BRAND,
  emailCodeBlock,
  emailInfoCard,
  emailLinkFallback,
  emailParagraph,
  emailSmallNote
} from '../const/email-brand';
import { EnvService } from '@config/env/env.service';
import { DBRepository } from '@config/db/db.repository';
import { IsNull } from 'typeorm';

@Injectable()
export class EmailService {
  private transporter: Transporter;
  private emailConfig: EmailConfig;
  private readonly templatesPath: string;

  constructor(
    private envService: EnvService,
    @Inject(DBRepository) private dbRepository: DBRepository
  ) {
    const distTemplates = path.join(__dirname, '..', 'templates');
    const srcTemplates = path.join(process.cwd(), 'src', 'shared', 'auth', 'templates');
    this.templatesPath = fs.existsSync(distTemplates) ? distTemplates : srcTemplates;
  }
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

  private compileTemplate(templateName: string): HandlebarsTemplateDelegate {
    try {
      const templatePath = path.join(this.templatesPath, `${templateName}.hbs`);
      const templateSource = fs.readFileSync(templatePath, 'utf8');
      return Handlebars.compile(templateSource);
    } catch (error) {
      throw new BadRequestException(`Template ${templateName} not found: ${error.message}`);
    }
  }

  async sendTemplateEmail(templateName: string, data: any, options: Omit<SendEmailOptions, 'html'>): Promise<void> {
    const template = this.compileTemplate(templateName);
    const html = template(data);

    await this.send({
      ...options,
      html
    });
  }

  private getFrontendUrl(): string {
    return (this.envService.get('FRONTEND_URL') || 'http://localhost:3000').replace(/\/$/, '');
  }

  private baseTemplateData(overrides: Record<string, unknown>) {
    return {
      appName: EMAIL_BRAND.appName,
      appTagline: EMAIL_BRAND.appTagline,
      supportEmail: EMAIL_BRAND.supportEmail,
      frontendUrl: this.getFrontendUrl(),
      year: new Date().getFullYear(),
      ...overrides
    };
  }

  async sendNewUserEmail(data: { firstName: string; lastName: string; email: string }): Promise<void> {
    const loginUrl = `${this.getFrontendUrl()}/login`;
    const content = [
      emailInfoCard(
        'Tu cuenta ya está activa',
        'Ya puedes ingresar y comenzar a disfrutar de todas las funcionalidades de Ticketera.'
      ),
      emailParagraph(`Usuario registrado: <strong>${Handlebars.escapeExpression(data.email)}</strong>`)
    ].join('');

    await this.sendTemplateEmail(
      'base-email',
      this.baseTemplateData({
        preheader: `Bienvenido a Ticketera, ${data.firstName}. Tu cuenta ya está activa.`,
        title: '¡Bienvenido a',
        titleHighlight: 'Ticketera',
        titleSuffix: '!',
        subtitle: 'Gracias por confiar en nosotros para transformar tus próximos shows.',
        greeting: `Hola ${data.firstName} ${data.lastName},`,
        content,
        ctaUrl: loginUrl,
        ctaText: 'Iniciar sesión',
        linkFallback: emailLinkFallback(loginUrl),
        showFeatures: true
      }),
      {
        to: data.email,
        subject: `¡Bienvenido a Ticketera, ${data.firstName}!`,
        text: `Hola ${data.firstName} ${data.lastName}, tu cuenta en Ticketera ya está activa. Ingresa en: ${loginUrl}`
      }
    );
  }

  async sendResetPasswordEmail(data: { firstName: string; email: string; resetUrl: string }): Promise<void> {
    const content = emailParagraph(
      'Recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón para elegir una nueva.'
    );

    await this.sendTemplateEmail(
      'base-email',
      this.baseTemplateData({
        preheader: 'Restablece tu contraseña de Ticketera.',
        title: 'Recuperación de',
        titleHighlight: 'contraseña',
        greeting: `Hola ${data.firstName},`,
        content,
        ctaUrl: data.resetUrl,
        ctaText: 'Restablecer contraseña',
        linkFallback: emailLinkFallback(data.resetUrl),
        postCtaContent: emailSmallNote(
          'Este enlace expira en 1 hora. Si no solicitaste este cambio, ignora este correo.'
        )
      }),
      {
        to: data.email,
        subject: 'Restablecer contraseña — Ticketera',
        text: `Hola ${data.firstName}, restablece tu contraseña visitando: ${data.resetUrl}`
      }
    );
  }

  async sendLoginCodeEmail(data: { firstName: string; email: string; code: string }): Promise<void> {
    const content = [
      emailParagraph('Usa el siguiente código para ingresar a tu cuenta:'),
      emailCodeBlock(data.code),
      emailSmallNote('Este código expira en 5 minutos. Si no lo solicitaste, ignora este correo.')
    ].join('');

    await this.sendTemplateEmail(
      'base-email',
      this.baseTemplateData({
        preheader: `Tu código de acceso a Ticketera es ${data.code}`,
        title: 'Código de',
        titleHighlight: 'acceso',
        greeting: `Hola ${data.firstName},`,
        content
      }),
      {
        to: data.email,
        text: `Hola ${data.firstName}, tu codigo de acceso es ${data.code}. Expira en 5 minutos.`,
        subject: 'Código de validación de acceso — Ticketera'
      }
    );
  }

  async sendRegistrationEmail(data: { firstName: string; email: string; validationUrl: string }): Promise<void> {
    const content = emailInfoCard(
      'Confirma tu correo electrónico',
      'Tu cuenta fue registrada correctamente. Para completar el proceso y activar tu acceso, valida tu dirección de correo.'
    );

    await this.sendTemplateEmail(
      'base-email',
      this.baseTemplateData({
        preheader: 'Confirma tu registro en Ticketera.',
        title: '¡Registro',
        titleHighlight: 'exitoso',
        titleSuffix: '!',
        subtitle: 'Estás a un paso de comenzar a comprar tus entradas en Ticketera.',
        greeting: `Hola ${data.firstName},`,
        content,
        ctaUrl: data.validationUrl,
        ctaText: 'Validar correo electrónico',
        linkFallback: emailLinkFallback(data.validationUrl),
        postCtaContent: emailSmallNote('Este enlace expira en 24 horas. Si no creaste esta cuenta, ignora este correo.')
      }),
      {
        to: data.email,
        subject: 'Confirma tu registro — Ticketera',
        text: `Hola ${data.firstName}, valida tu correo visitando: ${data.validationUrl}`
      }
    );
  }

  async sendEmailVerifiedEmail(data: { firstName: string; email: string }): Promise<void> {
    const loginUrl = `${this.getFrontendUrl()}/login`;
    const content = [
      emailInfoCard(
        'Correo validado exitosamente',
        'Tu dirección de correo ha sido confirmada. Ya puedes iniciar sesión y comenzar a disfrutar de todas las funcionalidades de Ticketera.'
      ),
      emailParagraph(
        'Gracias por ser parte de Ticketera. Estamos felices de acompañarte en tus próximos shows.'
      )
    ].join('');

    await this.sendTemplateEmail(
      'base-email',
      this.baseTemplateData({
        preheader: 'Tu correo fue validado correctamente en Ticketera.',
        title: 'Correo',
        titleHighlight: 'validado',
        titleSuffix: ' correctamente',
        subtitle: 'Tu cuenta está lista para usar.',
        greeting: `Hola ${data.firstName},`,
        content,
        ctaUrl: loginUrl,
        ctaText: 'Iniciar sesión',
        linkFallback: emailLinkFallback(loginUrl)
      }),
      {
        to: data.email,
        subject: 'Correo validado correctamente — Ticketera',
        text: `Hola ${data.firstName}, tu correo fue validado correctamente. Gracias por ser parte de Ticketera. Inicia sesión en: ${loginUrl}`
      }
    );
  }
}
