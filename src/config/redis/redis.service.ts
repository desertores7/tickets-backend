import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EnvService } from '@config/env/env.service';
import Redis, { RedisOptions } from 'ioredis';
import { resolveRedisConnection, toIoredisOptions } from './redis.connection';

// Lua script: decrement stock atomically; returns new value or -1 if insufficient
const LUA_RESERVE_STOCK = `
local current = tonumber(redis.call('GET', KEYS[1]))
if current == nil then return -1 end
local qty = tonumber(ARGV[1])
if current < qty then return -1 end
return redis.call('DECRBY', KEYS[1], qty)
`;

/**
 * Reserva stock; si la clave no existe, la siembra desde el valor de MySQL y
 * recién ahí reserva. Todo en un solo script para que sea atómico: dos compras
 * simultáneas sobre una clave ausente no pueden sembrarla dos veces.
 *
 * Existe porque Redis es la fuente de verdad del stock disponible, pero no la
 * única copia: cualquier Redis que no sea el que creó la tanda (despliegue
 * nuevo, base restaurada, `FLUSHALL` de otra app en un Redis compartido) no
 * tiene la clave, y sin esto la plataforma deja de vender en silencio.
 *
 * Devuelve -1 si de verdad no alcanza el stock, -2 si no hay clave ni valor de
 * respaldo para sembrarla.
 */
const LUA_RESERVE_STOCK_OR_INIT = `
local current = redis.call('GET', KEYS[1])
if current == false then
  local fallback = tonumber(ARGV[2])
  if fallback == nil or fallback < 0 then return -2 end
  redis.call('SET', KEYS[1], fallback)
  current = fallback
end
current = tonumber(current)
local qty = tonumber(ARGV[1])
if current < qty then return -1 end
return redis.call('DECRBY', KEYS[1], qty)
`;

// Lua script: lee un valor y lo borra en el mismo paso (canje de un solo uso)
const LUA_TAKE_EPHEMERAL = `
local v = redis.call('GET', KEYS[1])
if v == false then return nil end
redis.call('DEL', KEYS[1])
return v
`;

// Lua script: increment stock atomically; returns new value
const LUA_RELEASE_STOCK = `
return tonumber(redis.call('INCRBY', KEYS[1], tonumber(ARGV[1])))
`;

// Lua script: get stock; returns 0 if key does not exist
const LUA_GET_STOCK = `
local v = redis.call('GET', KEYS[1])
if v == false then return 0 end
return tonumber(v)
`;

// Lua script: set stock to an absolute value; returns the value set
const LUA_SET_STOCK = `
redis.call('SET', KEYS[1], tonumber(ARGV[1]))
return tonumber(ARGV[1])
`;

// Lua script: pop N users from waiting sorted set and write them to admitted sorted set with expiry score
// KEYS[1] = waiting:{eventId}, KEYS[2] = admitted:{eventId}
// ARGV[1] = count, ARGV[2] = current timestamp ms, ARGV[3] = ttl ms
const LUA_WAITING_ROOM_ADMIT = `
local members = redis.call('ZPOPMIN', KEYS[1], ARGV[1])
local expiry = tonumber(ARGV[2]) + tonumber(ARGV[3])
local admitted = {}
for i = 1, #members, 2 do
  local userId = members[i]
  redis.call('ZADD', KEYS[2], expiry, userId)
  table.insert(admitted, userId)
end
return admitted
`;

// Lua script: check if a user has a valid (non-expired) admission token
// KEYS[1] = admitted:{eventId}, ARGV[1] = userId, ARGV[2] = current timestamp ms
// Returns 1 if admitted and not expired, 0 otherwise (also cleans up the expired entry)
const LUA_WAITING_ROOM_IS_ADMITTED = `
local score = tonumber(redis.call('ZSCORE', KEYS[1], ARGV[1]))
if score == nil then return 0 end
if score < tonumber(ARGV[2]) then
  redis.call('ZREM', KEYS[1], ARGV[1])
  return 0
end
return 1
`;

// Lua script: mark an idempotency key with NX + EX; returns 1 on first call, 0 if already set
const LUA_MARK_IDEMPOTENCY = `
local result = redis.call('SET', KEYS[1], '1', 'NX', 'EX', ARGV[1])
if result then return 1 else return 0 end
`;

const BASE_OPTIONS: RedisOptions = {
  lazyConnect: false,
  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => Math.min(times * 200, 5000)
};

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private redis: Redis;

  constructor(private readonly envService: EnvService) {}

  onModuleInit() {
    const connection = resolveRedisConnection(this.envService);
    const ioredisOptions = toIoredisOptions(connection);

    this.logger.log(`Connecting to Redis at ${connection.label}`);

    this.redis =
      typeof ioredisOptions === 'string'
        ? new Redis(ioredisOptions, BASE_OPTIONS)
        : new Redis({ ...BASE_OPTIONS, ...ioredisOptions });

    this.redis.on('connect', () => this.logger.log('Redis connected'));
    this.redis.on('ready', () => this.logger.log('Redis ready'));
    this.redis.on('error', (err: Error) => this.logger.error(`Redis error: ${err.message}`));
    this.redis.on('close', () => this.logger.warn('Redis connection closed'));
    this.redis.on('reconnecting', () => this.logger.warn('Redis reconnecting'));
  }

  async onModuleDestroy() {
    await this.redis.quit();
    this.logger.log('Redis disconnected');
  }

  // ---------------------------------------------------------------------------
  // Stock control (atomic via Lua)
  // ---------------------------------------------------------------------------

  async reserveStock(stockKey: string, quantity: number): Promise<number> {
    const result = await this.redis.eval(LUA_RESERVE_STOCK, 1, stockKey, String(quantity));
    return result as number;
  }

  /**
   * Reserva, sembrando la clave desde MySQL si falta (ver
   * `LUA_RESERVE_STOCK_OR_INIT`). -1 = sin stock, -2 = sin clave ni respaldo.
   */
  async reserveStockOrInit(
    stockKey: string,
    quantity: number,
    fallbackQuantity: number
  ): Promise<number> {
    const result = await this.redis.eval(
      LUA_RESERVE_STOCK_OR_INIT,
      1,
      stockKey,
      String(quantity),
      String(fallbackQuantity)
    );
    return result as number;
  }

  async releaseStock(stockKey: string, quantity: number): Promise<number> {
    const result = await this.redis.eval(LUA_RELEASE_STOCK, 1, stockKey, String(quantity));
    return result as number;
  }

  async getStock(stockKey: string): Promise<number> {
    const result = await this.redis.eval(LUA_GET_STOCK, 1, stockKey);
    return result as number;
  }

  async setStock(stockKey: string, quantity: number): Promise<number> {
    const result = await this.redis.eval(LUA_SET_STOCK, 1, stockKey, String(quantity));
    return result as number;
  }

  // ---------------------------------------------------------------------------
  // Waiting room (Sorted Sets)
  // Keys: waiting:{eventId} / admitted:{eventId}
  // ---------------------------------------------------------------------------

  async waitingRoomAdd(eventId: string, userId: string): Promise<boolean> {
    const score = Date.now();
    const added = await this.redis.zadd(`waiting:${eventId}`, 'NX', score, userId);
    return added === 1;
  }

  async waitingRoomAdmit(eventId: string, count: number, ttlMs: number): Promise<string[]> {
    const result = await this.redis.eval(
      LUA_WAITING_ROOM_ADMIT,
      2,
      `waiting:${eventId}`,
      `admitted:${eventId}`,
      String(count),
      String(Date.now()),
      String(ttlMs)
    );
    return result as string[];
  }

  async waitingRoomIsAdmitted(eventId: string, userId: string): Promise<boolean> {
    const result = await this.redis.eval(
      LUA_WAITING_ROOM_IS_ADMITTED,
      1,
      `admitted:${eventId}`,
      userId,
      String(Date.now())
    );
    return result === 1;
  }

  async waitingRoomConsumeToken(eventId: string, userId: string): Promise<boolean> {
    const removed = await this.redis.zrem(`admitted:${eventId}`, userId);
    return removed === 1;
  }

  // ---------------------------------------------------------------------------
  // Idempotency for webhooks
  // ---------------------------------------------------------------------------

  async markIdempotency(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.eval(LUA_MARK_IDEMPOTENCY, 1, key, String(ttlSeconds));
    return result === 1;
  }

  /**
   * Contador con TTL (rate limit). Devuelve el valor tras INCR.
   * Si la key es nueva, setea EXPIRE; si ya existía, no renueva la ventana.
   */
  async incrWithExpire(key: string, ttlSeconds: number): Promise<number> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, ttlSeconds);
    }
    return count;
  }

  async getCounter(key: string): Promise<number> {
    const v = await this.redis.get(key);
    return v ? Number(v) || 0 : 0;
  }

  /** Siembra un contador con TTL. Se usa para el contador de ingresos por evento. */
  async setCounter(key: string, value: number, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, String(value), 'EX', ttlSeconds);
  }

  async deleteKey(key: string): Promise<void> {
    await this.redis.del(key);
  }

  // ---------------------------------------------------------------------------
  // Valores efímeros de un solo uso (tickets del OAuth de Google)
  // ---------------------------------------------------------------------------

  /** Guarda un valor con TTL. Se usa para canjes de un solo uso. */
  async setEphemeral(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, 'EX', ttlSeconds);
  }

  /**
   * Lee sin consumir. Para valores que se consultan muchas veces antes de
   * vencer, como el estado de un análisis que el frontend va sondeando.
   */
  async getEphemeral(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  /**
   * Lee y borra en la misma operación: el valor se consume una sola vez.
   *
   * Va por Lua y no por `GETDEL` porque ese comando recién existe desde Redis
   * 6.2 y este Redis se comparte con otras apps del host: no controlamos su
   * versión. Devuelve `null` si la clave venció o ya se consumió.
   */
  async takeEphemeral(key: string): Promise<string | null> {
    const value = await this.redis.eval(LUA_TAKE_EPHEMERAL, 1, key);
    return typeof value === 'string' ? value : null;
  }
}
