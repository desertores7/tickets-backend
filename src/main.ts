import { config } from 'dotenv';
config();

import { NestFactory } from '@nestjs/core';
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

    setupCors(app, allowedOrigins);
    app.getHttpAdapter().getInstance().set('trust proxy', 1);

    app.setGlobalPrefix('api');

    const httpAdapter = app.getHttpAdapter();
    const expressInstance = httpAdapter.getInstance();
    expressInstance.get('/', (_req: unknown, res: { status: (n: number) => { json: (b: object) => void } }) => {
      res.status(200).json({
        status: 'ok',
        message: 'API is running',
        health: '/api/health',
        docs: SWAGGER_URL
      });
    });

    const port = envService.get('PORT') || 3005;
    setupSwagger(app, {
      port,
      baseUrl: envService.get('BASE_URL')
    });

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
