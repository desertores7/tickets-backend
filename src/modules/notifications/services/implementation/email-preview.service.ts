import { Injectable, Logger } from '@nestjs/common';
import { EnvService } from '@config/env/env.service';
import { EmailService } from '@root/shared/auth/services/email.service';
import { EMAIL_TEMPLATES } from '@root/shared/email/resolve-templates-path';
import { EMAIL_BRAND, emailHeroUrl, resolvePublicSiteUrl } from '@root/shared/auth/const/email-brand';

/** Pausa entre cada envío: separa los 21 mails en el tiempo para no parecer un blast a los ojos de Gmail. */
const PREVIEW_SEND_DELAY_MS = 2500;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export type TEmailPreviewResult = {
  key: string;
  template: string;
  audience: string;
  subject: string;
  status: 'sent' | 'error';
  error?: string | null;
};

/**
 * Manda, a una sola casilla, una copia de cada diseño de email que existe en
 * la plataforma (cliente, productor y avisos internos), con datos ficticios.
 *
 * Pensado para revisar visualmente los ~20 templates en Gmail de una sola
 * pasada, sin tener que disparar cada flujo real (compra, reembolso, alta de
 * productora, etc.) para ver su diseño.
 */
@Injectable()
export class EmailPreviewService {
  private readonly logger = new Logger(EmailPreviewService.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly envService: EnvService
  ) {}

  private getFrontendUrl(): string {
    return resolvePublicSiteUrl(this.envService.get('FRONTEND_URL') || 'http://localhost:3000');
  }

  private heroData(): Record<string, unknown> {
    const frontendUrl = this.getFrontendUrl();
    return {
      heroUrl: emailHeroUrl(frontendUrl),
      heroAlt: EMAIL_BRAND.appName,
      heroKicker: EMAIL_BRAND.heroKicker
    };
  }

  async sendAll(email: string): Promise<TEmailPreviewResult[]> {
    const frontendUrl = this.getFrontendUrl();
    const results: TEmailPreviewResult[] = [];

    const run = async (
      key: string,
      template: string,
      audience: string,
      subject: string,
      action: () => Promise<void>
    ): Promise<void> => {
      try {
        await action();
        results.push({ key, template, audience, subject, status: 'sent' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Preview "${key}" (${template}) failed: ${message}`);
        results.push({ key, template, audience, subject, status: 'error', error: message });
      }
      // Espaciado entre envíos: mandar 21 mails en ráfaga es justo el patrón que un proveedor
      // (o Gmail) puede leer como spam. La espera extra al final es insignificante.
      await sleep(PREVIEW_SEND_DELAY_MS);
    };

    // ── Cliente: alta y acceso ─────────────────────────────────────────────
    await run('welcome-new-user', EMAIL_TEMPLATES.welcomeNewUser, 'Cliente', `¡Bienvenido a ${EMAIL_BRAND.appName}, Lucía!`, () =>
      this.emailService.sendNewUserEmail({ firstName: 'Lucía', lastName: 'Fernández', email })
    );

    await run(
      'registration-welcome',
      EMAIL_TEMPLATES.registrationWelcome,
      'Cliente',
      `Bienvenido a ${EMAIL_BRAND.appName} — Verificá tu email`,
      () =>
        this.emailService.sendRegistrationEmail({
          firstName: 'Lucía',
          email,
          validationUrl: `${frontendUrl}/validate-email?token=preview-token-demo`,
          audience: 'client'
        })
    );

    await run('email-verified', EMAIL_TEMPLATES.emailVerified, 'Cliente', 'Correo verificado correctamente', () =>
      this.emailService.sendEmailVerifiedEmail({ firstName: 'Lucía', email })
    );

    await run('reset-password-code', EMAIL_TEMPLATES.resetPasswordCode, 'Cliente', 'Restablecer contraseña', () =>
      this.emailService.sendResetPasswordEmail({ firstName: 'Lucía', email, code: '482913' })
    );

    await run(
      'reset-password-success',
      EMAIL_TEMPLATES.resetPasswordSuccess,
      'Cliente',
      'Contraseña actualizada',
      () => this.emailService.sendPasswordResetSuccessEmail({ firstName: 'Lucía', email })
    );

    await run('login-2fa-code', EMAIL_TEMPLATES.login2faCode, 'Cliente', 'Código de validación de acceso', () =>
      this.emailService.sendLoginCodeEmail({ firstName: 'Lucía', email, code: '719245' })
    );

    // ── Cliente: compra, cambios de evento y reembolsos ─────────────────────
    await run(
      'ticket-email',
      EMAIL_TEMPLATES.ticketEmail,
      'Cliente',
      '🎫 Tus entradas para Bresh — Vuelta al Cole',
      () =>
        this.emailService.sendTemplateEmail(
          EMAIL_TEMPLATES.ticketEmail,
          {
            preheader: 'Tus entradas para Bresh — Vuelta al Cole están adjuntas en este correo.',
            firstName: 'Lucía',
            eventName: 'Bresh — Vuelta al Cole',
            eventDate: 'sábado, 14 de marzo de 2026 23:00',
            venueName: 'Complejo Art Media',
            venueCity: 'CABA',
            orderNumber: 'SP-000482',
            ticketCount: 2,
            tickets: [
              { ticketNumber: 'SP-000482-01', ticketTypeName: 'General · 1 Entrada' },
              { ticketNumber: 'SP-000482-02', ticketTypeName: 'General · 1 Entrada' }
            ],
            summary: {
              lines: [{ name: 'General', detail: 'General · 2 entradas', amount: '$30.000,00' }],
              subtotal: '$30.000,00',
              hasDiscount: true,
              discount: '$3.000,00',
              serviceFee: '$3.600,00',
              total: '$30.600,00',
              paymentLabel: 'Visa terminada en 4242',
              installmentsLabel: '3 cuotas',
              paidAt: '10/03/2026 18:22'
            },
            ticketsUrl: `${frontendUrl}/client/tickets`,
            ...this.heroData()
          },
          { to: email, subject: '🎫 Tus entradas para Bresh — Vuelta al Cole' }
        )
    );

    await run(
      'event-material-change-reprogramacion',
      EMAIL_TEMPLATES.eventMaterialChange,
      'Cliente',
      'Reprogramación: Bresh — Vuelta al Cole',
      () =>
        this.emailService.sendTemplateEmail(
          EMAIL_TEMPLATES.eventMaterialChange,
          {
            firstName: 'Lucía',
            eventName: 'Bresh — Vuelta al Cole',
            changeType: 'Reprogramación',
            changeRows: [
              { label: 'Fecha y hora', before: 'sáb. 14 mar. 2026 · 23:00', after: 'sáb. 21 mar. 2026 · 23:00' }
            ],
            reason: 'El line-up pidió mover la fecha por superposición con otro show.',
            refundWindowEndsAt: '17/03/2026 23:59',
            purchasesUrl: `${frontendUrl}/client/payments`,
            isCancellation: false,
            preheader: 'Reprogramación en Bresh — Vuelta al Cole',
            ...this.heroData()
          },
          { to: email, subject: 'Reprogramación: Bresh — Vuelta al Cole' }
        )
    );

    await run(
      'event-material-change-cancelacion',
      EMAIL_TEMPLATES.eventMaterialChange,
      'Cliente',
      'Cancelación: Fiesta Under — Edición Invierno',
      () =>
        this.emailService.sendTemplateEmail(
          EMAIL_TEMPLATES.eventMaterialChange,
          {
            firstName: 'Lucía',
            eventName: 'Fiesta Under — Edición Invierno',
            changeType: 'Cancelación',
            changeRows: [],
            reason: 'El venue canceló la reserva por trabajos de mantenimiento edilicio.',
            refundWindowEndsAt: '30/07/2026 23:59',
            purchasesUrl: `${frontendUrl}/client/payments`,
            isCancellation: true,
            preheader: 'Cancelación en Fiesta Under — Edición Invierno',
            ...this.heroData()
          },
          { to: email, subject: 'Cancelación: Fiesta Under — Edición Invierno' }
        )
    );

    await run(
      'event-changed-legacy',
      EMAIL_TEMPLATES.eventChanged,
      'Cliente',
      'Evento cancelado — Techno Sunset Rooftop',
      () =>
        this.emailService.sendTemplateEmail(
          EMAIL_TEMPLATES.eventChanged,
          {
            firstName: 'Lucía',
            eventName: 'Techno Sunset Rooftop',
            isCancellation: true,
            reason: 'Condiciones climáticas — el venue es al aire libre.',
            changes: [],
            ticketsUrl: `${frontendUrl}/client/tickets`,
            ...this.heroData()
          },
          { to: email, subject: 'Evento cancelado — Techno Sunset Rooftop' }
        )
    );

    await run(
      'refund-result-aprobado',
      'refund-result',
      'Cliente',
      'Reembolso aprobado — Bresh — Vuelta al Cole',
      () =>
        this.emailService.sendTemplateEmail(
          'refund-result',
          {
            firstName: 'Lucía',
            eventName: 'Bresh — Vuelta al Cole',
            approved: true,
            amount: '15.300,00',
            currency: 'ARS',
            reason: null,
            ticketLabel: '1 entrada',
            ticketsUrl: `${frontendUrl}/client/tickets`
          },
          { to: email, subject: 'Reembolso aprobado — Bresh — Vuelta al Cole' }
        )
    );

    await run(
      'refund-result-rechazado',
      'refund-result',
      'Cliente',
      'Sobre tu pedido de reembolso — Bresh — Vuelta al Cole',
      () =>
        this.emailService.sendTemplateEmail(
          'refund-result',
          {
            firstName: 'Lucía',
            eventName: 'Bresh — Vuelta al Cole',
            approved: false,
            amount: '15.300,00',
            currency: 'ARS',
            reason: 'La solicitud llegó fuera de la ventana de reembolso habilitada.',
            ticketLabel: '1 entrada',
            ticketsUrl: `${frontendUrl}/client/tickets`
          },
          { to: email, subject: 'Sobre tu pedido de reembolso — Bresh — Vuelta al Cole' }
        )
    );

    // ── Productor: alta de cuenta y organización ────────────────────────────
    await run(
      'registration-welcome-producer',
      EMAIL_TEMPLATES.registrationWelcomeProducer,
      'Productor',
      `Bienvenido a ${EMAIL_BRAND.appName} — Verificá tu email`,
      () =>
        this.emailService.sendRegistrationEmail({
          firstName: 'Nicolás',
          email,
          validationUrl: `${frontendUrl}/validate-email?token=preview-token-demo`,
          audience: 'producer'
        })
    );

    await run(
      'producer-welcome',
      EMAIL_TEMPLATES.producerWelcome,
      'Productor',
      `¡Bienvenido a ${EMAIL_BRAND.appName}, Nicolás!`,
      () => this.emailService.sendProducerWelcomeEmail({ firstName: 'Nicolás', email })
    );

    await run(
      'organization-submitted',
      EMAIL_TEMPLATES.organizationSubmitted,
      'Productor',
      'Solicitud recibida — Fiesta Under S.R.L.',
      () =>
        this.emailService.sendOrganizationSubmittedEmail({
          firstName: 'Nicolás',
          email,
          organizationName: 'Fiesta Under S.R.L.'
        })
    );

    await run(
      'organization-approved',
      EMAIL_TEMPLATES.organizationApproved,
      'Productor',
      'Productora aprobada — Fiesta Under S.R.L.',
      () =>
        this.emailService.sendOrganizationApprovedEmail({
          firstName: 'Nicolás',
          email,
          organizationName: 'Fiesta Under S.R.L.'
        })
    );

    await run(
      'organization-rejected',
      EMAIL_TEMPLATES.organizationRejected,
      'Productor',
      'Validación rechazada — Fiesta Under S.R.L.',
      () =>
        this.emailService.sendOrganizationRejectedEmail({
          firstName: 'Nicolás',
          email,
          organizationName: 'Fiesta Under S.R.L.',
          rejectionReason: 'El CBU cargado no coincide con la razón social informada.'
        })
    );

    await run(
      'organization-suspended',
      EMAIL_TEMPLATES.organizationSuspended,
      'Productor',
      'Cuenta suspendida — Fiesta Under S.R.L.',
      () =>
        this.emailService.sendOrganizationSuspendedEmail({
          firstName: 'Nicolás',
          email,
          organizationName: 'Fiesta Under S.R.L.'
        })
    );

    await run(
      'producer-invite-productor',
      EMAIL_TEMPLATES.producerInvite,
      'Productor',
      'Invitación Productor — Fiesta Under S.R.L.',
      () =>
        this.emailService.sendProducerInviteEmail({
          email,
          organizationName: 'Fiesta Under S.R.L.',
          inviteUrl: `${frontendUrl}/producer/invite?token=preview-token-demo`,
          role: 'producer'
        })
    );

    await run(
      'producer-invite-validador',
      EMAIL_TEMPLATES.producerInvite,
      'Productor',
      'Invitación Validador — Fiesta Under S.R.L.',
      () =>
        this.emailService.sendProducerInviteEmail({
          email,
          organizationName: 'Fiesta Under S.R.L.',
          inviteUrl: `${frontendUrl}/producer/invite?token=preview-token-demo`,
          role: 'validator'
        })
    );

    // ── Interno: aviso a administradores ────────────────────────────────────
    await run(
      'admin-alert',
      EMAIL_TEMPLATES.adminAlert,
      'Admin (interno)',
      `Nueva productora para validar — ${EMAIL_BRAND.appName}`,
      () =>
        this.emailService.sendAdminAlertEmail({
          firstName: 'Admin',
          email,
          title: 'Nueva productora para validar',
          body: 'Fiesta Under S.R.L. envió sus datos fiscales y bancarios. Revisalos antes de aprobar la cuenta.',
          actionPath: '/admin/organizations/pending',
          actionLabel: 'Revisar solicitud'
        })
    );

    return results;
  }
}
