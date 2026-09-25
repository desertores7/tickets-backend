import { config } from 'dotenv';
config();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { EnvService } from '@config/env/env.service';
import { sendToDiscordFromEnv } from '@root/shared/services/discord-alert.service';
import { buildAllowedOrigins, setupCors } from '@root/shared/cors/cors-origin.util';
import { setupSwagger, SWAGGER_URL } from '@root/shared/const/swagger';

process.on('unhandledRejection', (reason: unknown) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  console.error('[Unhandled Rejection]', err);
  sendToDiscordFromEnv({
    title: 'Unhandled Rejection',
    description: err.message,
    color: 0xe74c3c,
    fields: err.stack ? [{ name: 'Stack', value: err.stack, inline: false }] : []
  }).catch(() => {});
});

process.on('uncaughtException', (error: Error) => {
  console.error('[Uncaught Exception]', error);
  sendToDiscordFromEnv({
    title: 'Uncaught Exception',
    description: error.message,
    color: 0xe74c3c,
    fields: error.stack ? [{ name: 'Stack', value: error.stack, inline: false }] : []
  }).catch(() => {});
  process.exit(1);
});

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log', 'debug', 'verbose']
    });

    const envService = app.get(EnvService);
    const allowedOrigins = buildAllowedOrigins({
      corsAllowedOrigins: envService.get('CORS_ALLOWED_ORIGINS'),
      frontendUrl: envService.get('FRONTEND_URL'),
      baseUrl: envService.get('BASE_URL')
    });

    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

    setupCors(app, allowedOrigins);
    app.getHttpAdapter().getInstance().set('trust proxy', 1);

    app.setGlobalPrefix('api/v1');

    const httpAdapter = app.getHttpAdapter();
    const expressInstance = httpAdapter.getInstance();
    expressInstance.get('/', (_req: unknown, res: { status: (n: number) => { json: (b: object) => void } }) => {
      res.status(200).json({
        status: 'ok',
        message: 'API is running',
        health: '/api/v1/health',
        docs: SWAGGER_URL
      });
    });

    const port = envService.get('PORT') || 3005;
    setupSwagger(app, {
      port,
      baseUrl: envService.get('BASE_URL'),
      swaggerUser: envService.get('SWAGGER_USER'),
      swaggerPassword: envService.get('SWAGGER_PASSWORD'),
      isProduction: envService.get('NODE_ENV') === 'production'
    });

    // `app.init()` monta las rutas/interceptors de Nest en la instancia de
    // Express. Lo llamamos explícito ANTES de agregar este middleware para
    // que quede último en la pila y funcione como red de contención: errores
    // de multer/busboy en uploads multipart (ej. el cliente corta la
    // conexión a mitad de un POST con archivo) a veces disparan un evento de
    // error en el stream que nunca pasa por el pipeline de Nest ni por el
    // `HttpExceptionFilter` — caen directo en el manejador default de
    // Express, que responde "Internal Server Error" en texto plano sin
    // loguear nada. Esto lo deja logueado y con el mismo formato de
    // respuesta que el resto de los 500 de la API.
    await app.init();
    expressInstance.use(
      (err: unknown, req: { method: string; originalUrl: string }, res: any, next: (err?: unknown) => void) => {
        if (res.headersSent) return next(err);
        const error = err instanceof Error ? err : new Error(String(err));
        console.error(`[Express fallback] ${req.method} ${req.originalUrl}`, error);
        sendToDiscordFromEnv({
          title: 'Error fuera del pipeline de Nest (fallback de Express)',
          description: error.message,
          color: 0xe74c3c,
          fields: [
            { name: 'Método', value: req.method, inline: true },
            { name: 'Ruta', value: req.originalUrl, inline: true },
            ...(error.stack ? [{ name: 'Stack', value: error.stack.slice(0, 1024), inline: false }] : [])
          ]
        }).catch(() => {});
        res.status(500).json({
          statusCode: 500,
          timestamp: new Date().toISOString(),
          path: req.originalUrl,
          message: envService.get('NODE_ENV') === 'production' ? 'Internal server error' : error.message
        });
      }
    );

    await app.listen(port);
    console.log(`Server is running on port ${port}`);
    console.log(`Swagger: http://localhost:${port}${SWAGGER_URL}`);
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('Critical error during bootstrap:', err);
    sendToDiscordFromEnv({
      title: 'Error en bootstrap',
      description: err.message,
      color: 0xe74c3c,
      fields: err.stack ? [{ name: 'Stack', value: err.stack, inline: false }] : []
    }).catch(() => {});
    process.exit(1);
  }
}

bootstrap().catch((error: unknown) => {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error('Fatal error in bootstrap:', err);
  process.exit(1);
});
