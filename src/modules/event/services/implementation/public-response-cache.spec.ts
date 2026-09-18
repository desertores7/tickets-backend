import { RedisService } from '@config/redis/redis.service';
import { PublicResponseCache } from './public-response-cache';

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

    await expect(cache.wrap('k', 10, load)).resolves.toEqual({ name: 'Evento' });
    await expect(cache.wrap('k', 10, load)).resolves.toEqual({ name: 'Evento' });
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

    await expect(Promise.all([a, b])).resolves.toEqual([42, 42]);
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

    await expect(cache.wrap('k', 10, async () => ({ value: 'ok', cacheable: true }))).resolves.toBe('ok');
  });

  it('un error de la base llega a todos los que esperaban y no queda trabado', async () => {
    const { redis } = fakeRedis();
    const cache = new PublicResponseCache(redis);

    await expect(
      cache.wrap('k', 10, async () => {
        throw new Error('Evento no encontrado');
      })
    ).rejects.toThrow('Evento no encontrado');
    await expect(cache.wrap('k', 10, async () => ({ value: 1, cacheable: true }))).resolves.toBe(1);
  });
});
