/**
 * Identidad de marca que usan todos los emails.
 *
 * Es la única fuente del nombre, la bajada y el contacto: los templates no
 * escriben "Showpass" a mano, lo reciben como `{{appName}}`. Cambiar acá
 * cambia los 13 templates a la vez.
 */

/**
 * URL pública del logo para los emails.
 *
 * Es el mismo wordmark del navbar, pero servido como PNG desde `/brand`: los
 * clientes de correo no cargan SVG ni data URIs. Sale de `APP_URL`; devuelve
 * null si no está configurada y el header cae al nombre en texto, así el email
 * igual se manda.
 */
export function emailLogoUrl(appUrl: string | undefined | null): string | null {
  const base = (appUrl ?? '').replace(/\/$/, '');
  return base ? `${base}/brand/showpass.png` : null;
}

/**
 * Imagen de portada de los emails de bienvenida y de entrega de entradas.
 *
 * Se sirve junto al logo. Los templates la tratan como opcional: si no hay
 * `APP_URL`, o si el cliente bloquea imágenes, el email se lee igual.
 */
export function emailHeroUrl(appUrl: string | undefined | null): string | null {
  const base = (appUrl ?? '').replace(/\/$/, '');
  return base ? `${base}/brand/email-hero.jpg` : null;
}

export const EMAIL_BRAND = {
  appName: 'Showpass',
  /** Bajada del header. Va en mayúsculas y espaciada, debajo del logo. */
  appTagline: 'Entradas para tus próximos eventos',
  /** Eslogan de marca. Se usa en la web (title y SEO), no en el header. */
  appSlogan: 'Tu noche. Tu show. Tu pass.',
  supportEmail: 'info@showpass.com.ar',
  siteUrl: 'https://showpass.com.ar',
  siteDomain: 'showpass.com.ar',
  /** Frase de la franja bajo la portada en los emails que llevan imagen. */
  heroKicker: 'Tu próxima noche empieza acá',
  colors: {
    /** Acento de la plataforma (`--accent-action`). */
    accent: '#ff2bd6',
    accentDark: '#c20f9e',
    /** Fondo del cliente de correo, por fuera de la tarjeta. */
    canvas: '#050409',
    /** Fondo de la tarjeta del email. */
    surface: '#0d0b12',
    /** Fondo de las cajas interiores (datos del evento, motivo, orden). */
    surfaceRaised: '#120f18',
    border: '#241f2e',
    textPrimary: '#ffffff',
    textBody: '#b4b0be',
    textMuted: '#9d99a8',
    textFaint: '#6a6673',
    white: '#ffffff'
  },
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
} as const;

/**
 * Variables de marca que espera cualquier template (header, footer y copy).
 *
 * Las arman los dos servicios que mandan correo, para que un email disparado
 * desde una cola tenga exactamente el mismo pie que uno disparado desde auth.
 */
export function emailBrandVars(
  appUrl: string | undefined | null,
  frontendUrl: string
): Record<string, unknown> {
  return {
    appName: EMAIL_BRAND.appName,
    appTagline: EMAIL_BRAND.appTagline,
    logoUrl: emailLogoUrl(appUrl),
    supportEmail: EMAIL_BRAND.supportEmail,
    siteUrl: EMAIL_BRAND.siteUrl,
    siteDomain: EMAIL_BRAND.siteDomain,
    frontendUrl: frontendUrl.replace(/\/$/, ''),
    year: new Date().getFullYear()
  };
}
