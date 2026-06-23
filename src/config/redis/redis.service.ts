import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EnvService } from '@config/env/env.service';
import Redis, { RedisOptions } from 'ioredis';

// Lua script: decrement stock atomically; returns new value or -1 if insufficient
const LUA_RESERVE_STOCK = `
local current = tonumber(redis.call('GET', KEYS[1]))
if current == nil then return -1 end
local qty = tonumber(ARGV[1])
if current < qty then return -1 end
return redis.call('DECRBY', KEYS[1], qty)
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
    const url = this.envService.get('REDIS_URL');

    this.redis = url
      ? new Redis(url, BASE_OPTIONS)
      : new Redis({
          ...BASE_OPTIONS,
          host: this.envService.get('REDIS_HOST'),
          port: this.envService.get('REDIS_PORT'),
          password: this.envService.get('REDIS_PASSWORD') ?? undefined
        });

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

  async deleteKey(key: string): Promise<void> {
    await this.redis.del(key);
  }
}
