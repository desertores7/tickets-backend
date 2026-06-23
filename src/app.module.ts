import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EnvModule } from '@config/env/env.module';
import { RedisModule } from '@config/redis/redis.module';
import { ControllerModule } from './modules/controller.module';
import { OrdersModule } from './modules/orders/orders.module';
import { UserJwtStrategy } from './shared/auth/strategies/user-jwt-strategy';
import { HttpExceptionFilter } from './shared/middlewares/exception-filter.filter';
import { DiscordAlertService } from './shared/services/discord-alert.service';
import { DbRetryInterceptor } from './shared/interceptors/db-retry.interceptor';

@Module({
  imports: [ConfigModule, EnvModule, RedisModule, ControllerModule, OrdersModule],
  controllers: [AppController],
  providers: [
    AppService,
    UserJwtStrategy,
    DiscordAlertService,
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: DbRetryInterceptor }
  ],
  exports: [UserJwtStrategy]
})
export class AppModule {}
