import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DBModule } from '@config/db/db.module';
import { QUEUE_NAMES } from '@config/redis/bull-jobs.types';
import { ServiceModule } from '../service.module';
import {
  TicketEmailFailureListener,
  TicketGenerationFailureListener
} from './listeners/ticket-delivery-failure.listener';

/**
 * Avisos al Admin que salen de las colas y no de una request (`33` §3).
 *
 * Va en un módulo aparte porque necesita `AdminNotifierService` (de
 * ServiceModule) y las colas de tickets y notificaciones, cuyos módulos a su
 * vez son importados por ServiceModule: ponerlo en cualquiera de ellos arma un
 * ciclo.
 */
@Module({
  imports: [
    DBModule,
    ServiceModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.TICKETS }),
    BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATIONS })
  ],
  providers: [TicketGenerationFailureListener, TicketEmailFailureListener]
})
export class AdminAlertsModule {}
