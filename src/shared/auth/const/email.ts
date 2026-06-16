export interface EmailConfig {
  uuid: string;
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface SendEmailOptions {
  to: string | string[];
  from?: string; // Opcional - si no se especifica, usa el email de la configuración SMTP
  subject: string;
  html?: string;
  text?: string;
  configUuid?: string;
}
