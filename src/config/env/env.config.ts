import { UnknownKeysParam, z, ZodRawShape, ZodTypeAny } from 'zod';

const stringToObj = (schema: z.ZodObject<ZodRawShape, UnknownKeysParam, ZodTypeAny>) =>
  z
    .string()
    .transform(obj => {
      try {
        return JSON.parse(obj);
      } catch (e) {
        console.error('Invalid DB_CONNECTION_DATA', e);
        return z.NEVER;
      }
    })
    .pipe(schema);

export const envSchema = z.object({
  PORT: z.coerce.number().default(3005),
  ENV: z.enum(['local', 'dev', 'prod']).default('local'),
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),

  DB_CONNECTION_DATA: z
    .string()
    .optional()
    .transform(val => {
      if (!val) return undefined;
      try {
        const parsed = JSON.parse(val);
        if (!parsed.host || !parsed.port || !parsed.username || !parsed.password || !parsed.database) {
          throw new Error('Missing required fields in DB_CONNECTION_DATA');
        }
        return parsed;
      } catch (e) {
        console.error('Invalid DB_CONNECTION_DATA', e);
        return undefined;
      }
    }),

  HOST_EMAIL: z.string().optional(),
  PORT_EMAIL: z.coerce.number().optional(),
  USERNAME_EMAIL: z.string().optional(),
  PASSWORD_EMAIL: z.string().optional(),
  DB_FALLBACK_NAME: z.string().optional(),

  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  JWT_ACCESS_EXPIRES: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(1, 'JWT_REFRESH_SECRET is required'),
  JWT_REFRESH_EXPIRES: z.string().default('7d'),

  CORS_ALLOWED_ORIGINS: z
    .string()
    .optional()
    .default('http://localhost:3000,http://localhost:3001,http://localhost:3005'),
  LOG_FUNCTION_URL: z.string().optional(),
  LOG_SERVICE: z.string().optional(),

  BASE_URL: z.string().url().optional(),
  FRONTEND_URL: z.string().url().optional().default('http://localhost:3000'),

  DISCORD_WEBHOOK_ALERTS: z.string().url().optional(),

  REDIS_URL: z.string().optional(),
  /** IP o hostname de Redis (tiene prioridad sobre REDIS_HOST si ambos están definidos) */
  REDIS_IP: z.string().optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  MERCADOPAGO_ACCESS_TOKEN: z.string().optional(),
  MERCADOPAGO_WEBHOOK_SECRET: z.string().optional(),
  APP_URL: z.string().url().optional()
});

export type Env = z.infer<typeof envSchema>;
