import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { isDbInactivityError } from '../utils/db-error.util';

/** Número máximo de intentos (1 inicial + reintentos). Tras suspensión el pool puede devolver varias conexiones muertas. */
const MAX_ATTEMPTS = 3;

/**
 * Interceptor global que ante errores de MySQL por conexión cerrada por inactividad
 * (p. ej. tras suspensión del cliente o wait_timeout) reintenta la petición hasta MAX_ATTEMPTS veces.
 * Así ningún endpoint falla de forma permanente por conexiones muertas en el pool.
 */
@Injectable()
export class DbRetryInterceptor implements NestInterceptor {
  private readonly logger = new Logger(DbRetryInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const tryAttempt = (attempt: number): Observable<unknown> =>
      next.handle().pipe(
        catchError((err: unknown) => {
          if (!isDbInactivityError(err)) {
            return throwError(() => err);
          }
          if (attempt >= MAX_ATTEMPTS) {
            this.logger.error(`Reintento falló tras ${MAX_ATTEMPTS} intentos: ${(err as any)?.message || String(err)}`);
            return throwError(() => err);
          }
          this.logger.warn(
            `Reintento ${attempt + 1}/${MAX_ATTEMPTS} tras error de conexión: ${(err as any)?.message || String(err)}`
          );
          return tryAttempt(attempt + 1);
        })
      );

    return tryAttempt(1);
  }
}
