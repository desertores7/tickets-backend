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
  /** Sesión web: el refresh renueva el access; 12h alcanza para un día de uso sin re-login. */
  JWT_REFRESH_EXPIRES: z.string().default('12h'),

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
  APP_URL: z.string().url().optional(),

  STORAGE_PATH: z.string().default('./storage'),

  QR_SECRET: z.string().default('change-this-to-a-random-secret-32chars'),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform(val => val === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM_NAME: z.string().optional(),
  SMTP_FROM_EMAIL: z.string().optional(),

  /** Destino de formularios de contacto / soporte (BR-SUPPORT-002) */
  SUPPORT_EMAIL: z.string().email().optional(),

  /** Gemini — análisis de flyers + generación de hero (opcional en local) */
  GEMINI_API_KEY: z.string().optional(),
  /** Modelo multimodal para extracción JSON */
  EVENT_AI_EXTRACT_MODEL: z.string().default('gemini-3.5-flash'),
  /** Modelo de imagen (3.6-flash no genera imágenes; usar Flash Image) */
  EVENT_AI_IMAGE_MODEL: z.string().default('gemini-3.1-flash-image'),
  /** Fallback si el primario responde 503 high-demand (modelo más estable) */
  EVENT_AI_IMAGE_FALLBACK_MODEL: z.string().default('gemini-2.5-flash-image'),
  /** Tope de análisis IA por usuario / hora (Redis) */
  EVENT_AI_MAX_PER_HOUR: z.coerce.number().int().min(1).max(100).default(5),
  /** Tope de análisis IA por usuario / día (Redis) */
  EVENT_AI_MAX_PER_DAY: z.coerce.number().int().min(1).max(500).default(15)
});

export type Env = z.infer<typeof envSchema>;
