import { ExecutionContext } from '@nestjs/common';
import { AppThrottlerGuard, LOAD_TEST_BYPASS_HEADER } from './app-throttler.guard';

/** Sin DI: los métodos que se prueban no tocan las dependencias del guard. */
function makeGuard(): AppThrottlerGuard {
  const guard = Object.create(AppThrottlerGuard.prototype) as AppThrottlerGuard;
  return guard;
}

function contextWithHeaders(headers: Record<string, string>): ExecutionContext {
  const req = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
    getHandler: () => undefined,
    getClass: () => undefined
  } as unknown as ExecutionContext;
}

const TOKEN = 'a'.repeat(64);

describe('AppThrottlerGuard', () => {
  const original = process.env.LOAD_TEST_BYPASS_TOKEN;
  afterEach(() => {
    process.env.LOAD_TEST_BYPASS_TOKEN = original;
  });

  describe('getTracker', () => {
    const tracker = (req: Record<string, unknown>) =>
      (makeGuard() as unknown as { getTracker(r: unknown): Promise<string> }).getTracker(req);

    it('cuenta por la IP real que manda Cloudflare', async () => {
      await expect(
        tracker({ headers: { 'cf-connecting-ip': '200.1.2.3' }, ips: ['172.68.0.1'], ip: '10.0.0.1' })
      ).resolves.toBe('200.1.2.3');
    });

    it('sin Cloudflare usa la IP del cliente de la cadena de proxies', async () => {
      await expect(tracker({ headers: {}, ips: ['200.9.9.9'], ip: '10.0.0.1' })).resolves.toBe('200.9.9.9');
      await expect(tracker({ headers: {}, ips: [], ip: '10.0.0.1' })).resolves.toBe('10.0.0.1');
    });
  });

  describe('shouldSkip — pase de pruebas de carga', () => {
    const skip = (headers: Record<string, string>) =>
      (makeGuard() as unknown as { shouldSkip(c: ExecutionContext): Promise<boolean> }).shouldSkip(
        contextWithHeaders(headers)
      );

    it('con el token correcto no cuenta la petición', async () => {
      process.env.LOAD_TEST_BYPASS_TOKEN = TOKEN;
      await expect(skip({ [LOAD_TEST_BYPASS_HEADER]: TOKEN })).resolves.toBe(true);
    });

    it('con un token distinto o sin header, cuenta', async () => {
      process.env.LOAD_TEST_BYPASS_TOKEN = TOKEN;
      await expect(skip({ [LOAD_TEST_BYPASS_HEADER]: 'b'.repeat(64) })).resolves.toBe(false);
      await expect(skip({})).resolves.toBe(false);
    });

    it('sin la variable, o con una variable corta, el pase no existe', async () => {
      process.env.LOAD_TEST_BYPASS_TOKEN = '';
      await expect(skip({ [LOAD_TEST_BYPASS_HEADER]: '' })).resolves.toBe(false);

      process.env.LOAD_TEST_BYPASS_TOKEN = 'corto';
      await expect(skip({ [LOAD_TEST_BYPASS_HEADER]: 'corto' })).resolves.toBe(false);
    });
  });
});
