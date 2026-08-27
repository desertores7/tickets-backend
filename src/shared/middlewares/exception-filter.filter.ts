import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { DiscordAlertService } from '@root/shared/services/discord-alert.service';

/** Captura todas las excepciones (HttpException, QueryFailedError, etc.) para loguear y enviar a Discord. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly discordAlert: DiscordAlertService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() || 500 : 500;
    // El ValidationPipe arma el detalle ("gender must be one of…") dentro de
    // getResponse().message, no en exception.message — que dice solo
    // "Bad Request Exception". Sin esto, toda validación llega opaca al front.
    const message = isHttpException
      ? extractHttpMessage(exception)
      : exception instanceof Error
        ? exception.message
        : String(exception);
    const stack = exception instanceof Error ? (exception.stack ?? '') : '';

    if (isHttpException && exception instanceof BadRequestException) {
      this.logger.error(`${request.method} ${request.url} ${status}`);
    } else {
      this.logger.error(`${request.method} ${request.url} ${status}\n${stack || message}`);
    }
    this.logger.error(`Message: ${message}`);
    if (request.body && Object.keys(request.body).length) this.logger.error(redactSensitive(request.body));

    if (status >= 500) {
      const description = message.slice(0, 1024);
      this.discordAlert
        .sendAlert({
          title: `Error HTTP ${status}`,
          description,
          color: 0xe74c3c,
          fields: [
            { name: 'Método', value: request.method, inline: true },
            { name: 'Ruta', value: request.url, inline: true },
            { name: 'Timestamp', value: new Date().toISOString(), inline: true },
            ...(stack ? [{ name: 'Stack', value: stack.slice(0, 1024), inline: false }] : [])
          ]
        })
        .catch(() => {});
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: isHttpException ? message : process.env.ENV === 'prod' ? 'Internal server error' : message
    });
  }
}


/**
 * Campos que nunca deben quedar escritos en el log. El filtro vuelca el body
 * de toda petición fallida, así que un login con contraseña equivocada dejaba
 * la contraseña en texto plano en los logs del contenedor.
 */
const SENSITIVE_KEYS = [
  'password',
  'currentPassword',
  'newPassword',
  'confirmPassword',
  'token',
  'access_token',
  'refresh_token',
  'code',
  'cbu',
  'taxId',
  'documentNumber',
  'billingIdNumber'
];

function redactSensitive(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const clone: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  for (const key of Object.keys(clone)) {
    if (SENSITIVE_KEYS.includes(key)) clone[key] = '[REDACTADO]';
  }
  return clone;
}


/** Devuelve el detalle de validación si existe; si no, el mensaje de la excepción. */
function extractHttpMessage(exception: HttpException): string {
  const body = exception.getResponse();
  if (typeof body === 'string') return body;

  const detail = (body as { message?: unknown })?.message;
  if (Array.isArray(detail)) return detail.join('. ');
  if (typeof detail === 'string') return detail;

  return exception.message;
}
