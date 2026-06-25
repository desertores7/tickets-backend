import { EnvService } from '@config/env/env.service';
import { ConnectionOptions } from 'bullmq';
import { RedisOptions } from 'ioredis';

export type RedisConnectionConfig =
  | { mode: 'url'; url: string; label: string }
  | { mode: 'host'; host: string; port: number; password?: string; label: string };

export function resolveRedisConnection(env: EnvService): RedisConnectionConfig {
  const url = env.get('REDIS_URL');
  if (url) {
    return { mode: 'url', url, label: maskRedisUrl(url) };
  }

  const host = env.get('REDIS_IP') ?? env.get('REDIS_HOST');
  const port = env.get('REDIS_PORT');
  const password = env.get('REDIS_PASSWORD') ?? undefined;

  return {
    mode: 'host',
    host,
    port,
    password,
    label: `${host}:${port}`
  };
}

export function toBullMqConnection(config: RedisConnectionConfig): ConnectionOptions {
  if (config.mode === 'url') {
    return { url: config.url };
  }

  return {
    host: config.host,
    port: config.port,
    password: config.password
  };
}

export function toIoredisOptions(config: RedisConnectionConfig): RedisOptions | string {
  if (config.mode === 'url') {
    return config.url;
  }

  return {
    host: config.host,
    port: config.port,
    password: config.password
  };
}

function maskRedisUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return 'redis://***';
  }
}
