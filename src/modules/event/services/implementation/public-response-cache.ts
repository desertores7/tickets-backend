import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@config/redis/redis.service';

/**
 * Caché corto de las respuestas públicas de navegación: listado, ficha y mapa.
 *
 * En la prueba de navegación (load-tests/README.md) el servidor se saturó a
 * ~1.500 pedidos por segundo y casi 2 núcleos se los llevaba MySQL: cada visita
 * repetía las mismas consultas para mostrar exactamente lo mismo. Minutos antes
 * de una salida a la venta miles de personas refrescan la misma ficha.
 *
 * Reglas:
 * - Se guarda la respuesta ya armada (el DTO), no la entidad: lo que sale del
 *   caché es byte a byte lo que habría salido de la base.
 * - Solo se cachea lo que ve cualquier visitante igual: eventos publicados y de
 *   productoras activas. Borradores y fichas ocultas van siempre a la base.
 * - No hay invalidación explícita: el TTL es de segundos. Un cambio del
 *   productor tarda como mucho eso en verse en la ficha pública. La compra no
 *   depende de esto: el stock se valida en Redis al reservar.
 * - Si Redis falla, se sigue sin caché: navegar nunca puede romperse por esto.
 *
 * El mismo criterio decide qué guarda Cloudflare: `setPublicCacheHeaders` arma
 * los headers, y la regla de Cloudflare no cachea nada sin `s-maxage`. Así un
 * borrador nunca queda en el borde (ver load-tests/README.md).
 */
export const PUBLIC_CACHE_TTL = {
  /** Listado de la home: cambia poco y es lo más pedido. */
  list: 15,
  /** Ficha del evento. */
  detail: 10,
  /** Mapa + tandas: trae disponibilidad, así que es el más corto. */
  map: 5
} as const;

const PREFIX = 'public-cache:';

export type CacheableResult<T> = { value: T; cacheable: boolean };

/**
 * Header para Cloudflare. `max-age=0`: el navegador vuelve a preguntar siempre
 * (al borde, que responde rápido); `s-maxage`: cuánto lo guarda Cloudflare.
 */
export function cacheControl(cacheable: boolean, ttlSeconds: number): string {
  return cacheable ? `public, max-age=0, s-maxage=${ttlSeconds}` : 'private, no-store';
}

/**
 * Headers de una respuesta pública de navegación.
 *
 * CORS: el middleware global devuelve el `Origin` del pedido con
 * `Vary: Origin`, pero Cloudflare ignora `Vary`. Guardaría la respuesta pedida
 * desde el servidor del frontend (sin `Origin`, sin permiso de CORS) y se la
 * daría al navegador, que la rechazaría. Lo compartible sale con `*`: sirve para
 * cualquier origen y el frontend no manda cookies (sin `credentials`).
 */
export function setPublicCacheHeaders(
  res: { setHeader(name: string, value: string): unknown; removeHeader(name: string): unknown },
  cacheable: boolean,
  ttlSeconds: number
): void {
  res.setHeader('Cache-Control', cacheControl(cacheable, ttlSeconds));
  if (cacheable) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    // Con `*`, `Allow-Credentials: true` no sirve y el navegador lo rechaza si el pedido lleva cookies.
    res.removeHeader('Access-Control-Allow-Credentials');
    res.setHeader('Vary', 'Accept-Encoding');
  }
}

@Injectable()
export class PublicResponseCache {
  private readonly logger = new Logger(PublicResponseCache.name);

  /**
   * Pedidos en curso por clave. Cuando el caché vence, los pedidos que llegan
   * juntos a esta instancia comparten una sola consulta en vez de ir todos a
   * la base a la vez.
   */
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(private readonly redisService: RedisService) {}

  /**
   * Devuelve la respuesta cacheada o la arma con `load`. `load` indica si lo que
   * armó se puede compartir con cualquier visitante (`cacheable`); lo que sale
   * del caché lo es siempre, porque solo se guarda eso.
   */
  async wrap<T>(
    key: string,
    ttlSeconds: number,
    load: () => Promise<CacheableResult<T>>
  ): Promise<CacheableResult<T>> {
    const fullKey = PREFIX + key;

    const hit = await this.read<T>(fullKey);
    if (hit !== null) return { value: hit, cacheable: true };

    const pending = this.inFlight.get(fullKey) as Promise<CacheableResult<T>> | undefined;
    if (pending) return pending;

    const promise = (async () => {
      const result = await load();
      if (result.cacheable) await this.write(fullKey, result.value, ttlSeconds);
      return result;
    })();

    this.inFlight.set(fullKey, promise);
    try {
      return await promise;
    } finally {
      this.inFlight.delete(fullKey);
    }
  }

  private async read<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redisService.getEphemeral(key);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch (error) {
      this.logger.warn(`No se pudo leer ${key} del caché: ${(error as Error).message}`);
      return null;
    }
  }

  private async write(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redisService.setEphemeral(key, JSON.stringify(value), ttlSeconds);
    } catch (error) {
      this.logger.warn(`No se pudo guardar ${key} en el caché: ${(error as Error).message}`);
    }
  }
}
