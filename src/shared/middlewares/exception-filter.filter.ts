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
    const message = isHttpException
      ? exception.message
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
    if (request.body && Object.keys(request.body).length) this.logger.error(request.body);

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
