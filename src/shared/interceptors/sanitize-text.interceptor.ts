import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { TextSanitizerService } from '../services/text-sanitizer.service';
import { SANITIZE_TEXT_METADATA, SanitizeTextOptions } from '../decorators/sanitize-text.decorator';

/**
 * Interceptor que sanitiza automáticamente textos según las opciones del decorator @SanitizeText
 */
@Injectable()
export class SanitizeTextInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly textSanitizer: TextSanitizerService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const options = this.reflector.get<SanitizeTextOptions>(SANITIZE_TEXT_METADATA, context.getHandler());

    if (!options) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const body = request.body;

    if (!body || typeof body !== 'object') {
      return next.handle();
    }

    // Si se especificaron propiedades, sanitizar solo esas
    if (options.properties && options.properties.length > 0) {
      const sanitizedBody = this.textSanitizer.sanitizeObject(body, options.properties, options.maxLength);
      request.body = sanitizedBody;
    } else {
      // Si no se especificaron propiedades, sanitizar todas las propiedades string
      const sanitizedBody = { ...body };
      for (const key in sanitizedBody) {
        if (typeof sanitizedBody[key] === 'string') {
          sanitizedBody[key] = this.textSanitizer.sanitize(sanitizedBody[key], options.maxLength, options.defaultValue);
        }
      }
      request.body = sanitizedBody;
    }

    return next.handle();
  }
}
