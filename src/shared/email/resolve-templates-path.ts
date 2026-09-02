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
  emailVerified: 'email-verified',
  resetPasswordCode: 'reset-password-code',
  login2faCode: 'login-2fa-code',
  welcomeNewUser: 'welcome-new-user',
  ticketEmail: 'ticket-email',
  organizationApproved: 'organization-approved',
  organizationRejected: 'organization-rejected',
  organizationSubmitted: 'organization-submitted',
  producerInvite: 'producer-invite',
  eventChanged: 'event-changed'
} as const;

export type EmailTemplateName = (typeof EMAIL_TEMPLATES)[keyof typeof EMAIL_TEMPLATES];
