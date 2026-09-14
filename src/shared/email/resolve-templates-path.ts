import * as fs from 'fs';
import * as path from 'path';

/**
 * Carpeta canónica de templates Handlebars.
 * En runtime: `dist/shared/email/templates` (tras `pnpm build` / copy-templates).
 * En desarrollo: `src/shared/email/templates`.
 */
export function resolveEmailTemplatesPath(): string {
  const distTemplates = path.join(__dirname, 'templates');
  const srcTemplates = path.join(process.cwd(), 'src', 'shared', 'email', 'templates');

  if (fs.existsSync(distTemplates)) {
    return distTemplates;
  }
  return srcTemplates;
}

/** Nombres de archivo `.hbs` (sin extensión). Usar estos al agregar / enviar mails. */
export const EMAIL_TEMPLATES = {
  registrationWelcome: 'registration-welcome',
  /** Alta de productora (mismo flujo de verificación, copy orientado a ventas). */
  registrationWelcomeProducer: 'registration-welcome-producer',
  emailVerified: 'email-verified',
  resetPasswordCode: 'reset-password-code',
  /** Confirmación tras restablecer la contraseña con el código. */
  resetPasswordSuccess: 'reset-password-success',
  login2faCode: 'login-2fa-code',
  welcomeNewUser: 'welcome-new-user',
  ticketEmail: 'ticket-email',
  organizationApproved: 'organization-approved',
  organizationRejected: 'organization-rejected',
  organizationSubmitted: 'organization-submitted',
  producerInvite: 'producer-invite',
  /** Aviso interno a Administradores (validaciones, cambios fiscales, etc.). */
  adminAlert: 'admin-alert',
  /** Template de mario: aviso de cambio material a compradores */
  eventMaterialChange: 'event-material-change',
  /** Alias legacy de main (mismo flujo; preferir `eventMaterialChange`) */
  eventChanged: 'event-changed'
} as const;

export type EmailTemplateName = (typeof EMAIL_TEMPLATES)[keyof typeof EMAIL_TEMPLATES];
