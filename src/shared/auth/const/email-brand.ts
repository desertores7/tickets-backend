export const EMAIL_BRAND = {
  appName: 'DentalHub',
  appTagline: 'Tu consultorio, todo en un solo lugar.',
  supportEmail: 'hola@dentalhub.com.ar',
  colors: {
    teal: '#4FB9A8',
    tealDark: '#3A9A8D',
    tealLight: '#E8F6F4',
    cream: '#FDFBF7',
    white: '#FFFFFF',
    textPrimary: '#1A1A1A',
    textSecondary: '#707070',
    textBody: '#555555',
    border: '#EEEEEE',
    supportBg: '#F5FAF9',
    footerBg: '#1A1A1A',
    footerText: '#A0A0A0',
    footerLink: '#CCCCCC',
    buttonDark: '#1A1A1A'
  },
  fontFamily: "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
} as const;

export function emailCodeBlock(code: string): string {
  const safeCode = HandlebarsEscape(code);

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 24px auto;">
      <tr>
        <td align="center" style="padding: 18px 32px; background-color: ${EMAIL_BRAND.colors.tealLight}; border: 1px solid ${EMAIL_BRAND.colors.border}; border-radius: 12px;">
          <span style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: ${EMAIL_BRAND.colors.textPrimary};">
            ${safeCode}
          </span>
        </td>
      </tr>
    </table>
  `;
}

export function emailInfoCard(title: string, description: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 24px 0; border: 1px solid ${EMAIL_BRAND.colors.border}; border-radius: 12px; background-color: ${EMAIL_BRAND.colors.white};">
      <tr>
        <td style="padding: 20px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td width="48" valign="top" style="padding-right: 16px;">
                <div style="width: 40px; height: 40px; border-radius: 50%; background-color: ${EMAIL_BRAND.colors.tealLight}; text-align: center; line-height: 40px; font-size: 18px; color: ${EMAIL_BRAND.colors.teal};">
                  &#128100;
                </div>
              </td>
              <td valign="top">
                <p style="margin: 0 0 6px 0; font-family: ${EMAIL_BRAND.fontFamily}; font-size: 15px; font-weight: 700; color: ${EMAIL_BRAND.colors.textPrimary};">
                  ${HandlebarsEscape(title)}
                </p>
                <p style="margin: 0; font-family: ${EMAIL_BRAND.fontFamily}; font-size: 14px; line-height: 1.6; color: ${EMAIL_BRAND.colors.textBody};">
                  ${description}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

export function emailParagraph(text: string): string {
  return `
    <p style="margin: 0 0 16px 0; font-family: ${EMAIL_BRAND.fontFamily}; font-size: 15px; line-height: 1.7; color: ${EMAIL_BRAND.colors.textBody};">
      ${text}
    </p>
  `;
}

export function emailLinkFallback(url: string): string {
  const safeUrl = HandlebarsEscape(url);

  return `
    <p style="margin: 16px 0 0 0; font-family: ${EMAIL_BRAND.fontFamily}; font-size: 13px; line-height: 1.6; color: ${EMAIL_BRAND.colors.textSecondary};">
      Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
      <a href="${safeUrl}" target="_blank" style="color: ${EMAIL_BRAND.colors.teal}; word-break: break-all; text-decoration: underline;">
        ${safeUrl}
      </a>
    </p>
  `;
}

export function emailSmallNote(text: string): string {
  return `
    <p style="margin: 12px 0 0 0; font-family: ${EMAIL_BRAND.fontFamily}; font-size: 13px; line-height: 1.6; color: ${EMAIL_BRAND.colors.textSecondary};">
      ${text}
    </p>
  `;
}

function HandlebarsEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
