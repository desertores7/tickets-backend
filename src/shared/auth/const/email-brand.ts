/**
 * URL pública del logo para los emails.
 *
 * Sale de `APP_URL` porque lo sirve la API en `/brand`. Devuelve null si no
 * está configurada: el header cae al nombre en texto y el email igual se manda.
 */
export function emailLogoUrl(appUrl: string | undefined | null): string | null {
  const base = (appUrl ?? '').replace(/\/$/, '');
  return base ? `${base}/brand/showpass.png` : null;
}

export const EMAIL_BRAND = {
  appName: 'showpass',
  appTagline: 'Tus entradas, siempre a mano.',
  supportEmail: 'hola@ticketera.com',
  colors: {
    /** Acento de la plataforma (`--accent-action`). El nombre quedó de antes. */
    teal: '#ff2bd6',
    tealDark: '#c20f9e',
    tealLight: '#fff0fb',
    cream: '#f8fafc',
    white: '#FFFFFF',
    textPrimary: '#0f172a',
    textSecondary: '#64748b',
    textBody: '#334155',
    border: '#e2e8f0',
    supportBg: '#f8fafc',
    footerBg: '#020106',
    footerText: '#94a3b8',
    footerLink: '#cbd5e1',
    buttonDark: '#020106'
  },
  fontFamily: "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
} as const;
