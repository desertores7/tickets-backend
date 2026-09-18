import { RedisService } from '@config/redis/redis.service';
import { PublicResponseCache, cacheControl, setPublicCacheHeaders } from './public-response-cache';

function fakeRedis(overrides: Partial<Record<'getEphemeral' | 'setEphemeral', jest.Mock>> = {}) {
  const store = new Map<string, string>();
  return {
    store,
    redis: {
      getEphemeral: overrides.getEphemeral ?? jest.fn(async (k: string) => store.get(k) ?? null),
      setEphemeral: overrides.setEphemeral ?? jest.fn(async (k: string, v: string) => void store.set(k, v))
    } as unknown as RedisService
  };
}

describe('PublicResponseCache', () => {
  it('arma la respuesta una vez y después la sirve desde Redis', async () => {
    const { redis } = fakeRedis();
    const cache = new PublicResponseCache(redis);
    const load = jest.fn(async () => ({ value: { name: 'Evento' }, cacheable: true }));

    const expected = { value: { name: 'Evento' }, cacheable: true };
    await expect(cache.wrap('k', 10, load)).resolves.toEqual(expected);
    await expect(cache.wrap('k', 10, load)).resolves.toEqual(expected);
    expect(load).toHaveBeenCalledTimes(1);
    expect(redis.setEphemeral).toHaveBeenCalledWith('public-cache:k', '{"name":"Evento"}', 10);
  });

  it('no guarda lo que no se puede compartir (borradores)', async () => {
    const { redis } = fakeRedis();
    const cache = new PublicResponseCache(redis);
    const load = jest.fn(async () => ({ value: { draft: true }, cacheable: false }));

    await cache.wrap('k', 10, load);
    await cache.wrap('k', 10, load);
    expect(load).toHaveBeenCalledTimes(2);
    expect(redis.setEphemeral).not.toHaveBeenCalled();
  });

  it('pedidos simultáneos comparten una sola consulta', async () => {
    const { redis } = fakeRedis();
    const cache = new PublicResponseCache(redis);
    let resolve!: (v: { value: number; cacheable: boolean }) => void;
    const load = jest.fn(() => new Promise<{ value: number; cacheable: boolean }>(r => (resolve = r)));

    const a = cache.wrap('k', 10, load);
    const b = cache.wrap('k', 10, load);
    await new Promise(r => setImmediate(r));
    resolve({ value: 42, cacheable: true });

    await expect(Promise.all([a, b])).resolves.toEqual([
      { value: 42, cacheable: true },
      { value: 42, cacheable: true }
    ]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('si Redis falla, responde igual desde la base', async () => {
    const { redis } = fakeRedis({
      getEphemeral: jest.fn(async () => {
        throw new Error('down');
      }),
      setEphemeral: jest.fn(async () => {
        throw new Error('down');
      })
    });
    const cache = new PublicResponseCache(redis);

    await expect(cache.wrap('k', 10, async () => ({ value: 'ok', cacheable: true }))).resolves.toEqual({
      value: 'ok',
      cacheable: true
    });
  });

  it('un error de la base llega a todos los que esperaban y no queda trabado', async () => {
    const { redis } = fakeRedis();
    const cache = new PublicResponseCache(redis);

    await expect(
      cache.wrap('k', 10, async () => {
        throw new Error('Evento no encontrado');
      })
    ).rejects.toThrow('Evento no encontrado');
    await expect(cache.wrap('k', 10, async () => ({ value: 1, cacheable: true }))).resolves.toEqual({
      value: 1,
      cacheable: true
    });
  });

  it('el header deja a Cloudflare guardar solo lo compartible', () => {
    expect(cacheControl(true, 10)).toBe('public, max-age=0, s-maxage=10');
    expect(cacheControl(false, 10)).toBe('private, no-store');
  });

  it('lo compartible sale con CORS abierto; lo privado no se toca', () => {
    const headers = new Map<string, string>([['Access-Control-Allow-Credentials', 'true']]);
    const res = {
      setHeader: (n: string, v: string) => headers.set(n, v),
      removeHeader: (n: string) => headers.delete(n)
    };

    setPublicCacheHeaders(res, false, 10);
    expect(headers.get('Cache-Control')).toBe('private, no-store');
    expect(headers.has('Access-Control-Allow-Origin')).toBe(false);

    setPublicCacheHeaders(res, true, 10);
    expect(headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(headers.has('Access-Control-Allow-Credentials')).toBe(false);
    expect(headers.get('Vary')).toBe('Accept-Encoding');
  });
});
