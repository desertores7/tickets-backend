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
   * armó se puede compartir con cualquier visitante (`cacheable`).
   */
  async wrap<T>(
    key: string,
    ttlSeconds: number,
    load: () => Promise<{ value: T; cacheable: boolean }>
  ): Promise<T> {
    const fullKey = PREFIX + key;

    const hit = await this.read<T>(fullKey);
    if (hit !== null) return hit;

    const pending = this.inFlight.get(fullKey) as Promise<T> | undefined;
    if (pending) return pending;

    const promise = (async () => {
      const { value, cacheable } = await load();
      if (cacheable) await this.write(fullKey, value, ttlSeconds);
      return value;
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
