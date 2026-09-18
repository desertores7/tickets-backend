import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { timingSafeEqual } from 'crypto';

/** Header con el que el tráfico de las pruebas de carga se salta el límite. */
export const LOAD_TEST_BYPASS_HEADER = 'x-load-test-token';

/** Por debajo de esto el token se adivina: se ignora y el pase queda apagado. */
const MIN_BYPASS_TOKEN_LENGTH = 32;

/**
 * Límite de peticiones (`BR-SEC-001`) con dos ajustes sobre el guard de Nest.
 *
 * **1. Cuenta por comprador, no por proxy.** Delante de la API están Cloudflare
 * y el proxy del servidor. Con `trust proxy 1`, Express toma como IP el último
 * salto —la de Cloudflare—, y miles de compradores terminaban compartiendo el
 * mismo cupo: en una salida a la venta, casi todos recibían 429 aunque cada uno
 * hubiera hecho un par de pedidos. Cloudflare manda la IP real del cliente en
 * `CF-Connecting-IP`, así que se usa esa.
 *
 * Esa cabecera la puede inventar quien le pegue directo al servidor sin pasar
 * por Cloudflare. Para evitarlo, el origen tiene que aceptar tráfico solo de
 * Cloudflare (firewall del servidor).
 *
 * **2. Pase para pruebas de carga.** Una prueba corre desde una sola máquina, y
 * con un cupo de 60 por minuto por IP se frenaría en segundos sin medir nada.
 * Con `LOAD_TEST_BYPASS_TOKEN` configurado, las peticiones que traen ese token
 * en `x-load-test-token` no cuentan. Sin la variable el pase no existe: se deja
 * vacía fuera de las ventanas de prueba.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const cfIp = req.headers?.['cf-connecting-ip'];
    if (typeof cfIp === 'string' && cfIp.trim()) return cfIp.trim();
    return req.ips?.length ? req.ips[0] : req.ip;
  }

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (await super.shouldSkip(context)) return true;

    const expected = process.env.LOAD_TEST_BYPASS_TOKEN ?? '';
    if (expected.length < MIN_BYPASS_TOKEN_LENGTH) return false;

    const { req } = this.getRequestResponse(context);
    const received = req.headers?.[LOAD_TEST_BYPASS_HEADER];
    if (typeof received !== 'string' || received.length !== expected.length) return false;

    return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
  }
}
