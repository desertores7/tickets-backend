import { join, resolve } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EnvModule } from '@config/env/env.module';
import { RedisModule } from '@config/redis/redis.module';
import { ControllerModule } from './modules/controller.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { CheckInModule } from './modules/check-in/checkin.module';
import { EventCashSyncModule } from './modules/event-cash/event-cash-sync.module';
import { EventLifecycleModule } from './modules/event/event-lifecycle.module';
import { QrGenerationModule } from './modules/qr-generation/qr-generation.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { StorageModule } from './shared/services/storage.module';
import { UserJwtStrategy } from './shared/auth/strategies/user-jwt-strategy';
import { HttpExceptionFilter } from './shared/middlewares/exception-filter.filter';
import { DiscordAlertService } from './shared/services/discord-alert.service';
import { DbRetryInterceptor } from './shared/interceptors/db-retry.interceptor';

@Module({
  imports: [
    // BR-SEC-001. Dos ventanas: una corta contra ráfagas y una larga contra
    // el goteo sostenido, que una sola ventana no detiene.
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 60_000, limit: 60 },
      { name: 'long', ttl: 3_600_000, limit: 600 }
    ]),
    ConfigModule,
    EnvModule,
    RedisModule,
    StorageModule,
    ServeStaticModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // Solo tickets/ y events/ públicos. private/ (docs fiscales) NO se monta en /static.
        const storageRoot = resolve(process.cwd(), config.get('STORAGE_PATH', 'storage'));
        return [
          {
            rootPath: join(storageRoot, 'tickets'),
            serveRoot: '/static/tickets',
            serveStaticOptions: { index: false, fallthrough: false }
          },
          {
            rootPath: join(storageRoot, 'events'),
            serveRoot: '/static/events',
            serveStaticOptions: { index: false, fallthrough: false }
          },
          {
            rootPath: join(process.cwd(), 'public', 'scanner'),
            serveRoot: '/scanner',
            serveStaticOptions: {
              index: ['index.html'],
              fallthrough: false
            }
          }
        ];
      }
    }),
    QrGenerationModule,
    NotificationsModule,
    ControllerModule,
    OrdersModule,
    PaymentsModule,
    CheckInModule,
    EventCashSyncModule,
    EventLifecycleModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    UserJwtStrategy,
    DiscordAlertService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: DbRetryInterceptor }
  ],
  exports: [UserJwtStrategy]
})
export class AppModule {}
