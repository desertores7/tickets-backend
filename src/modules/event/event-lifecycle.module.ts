import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DBModule } from '@config/db/db.module';
import { EnvModule } from '@config/env/env.module';
import { QUEUE_NAMES } from '@config/redis/bull-jobs.types';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { UserPermissionService } from '@root/shared/services/userPermissions.service';
import { EmailService } from '@root/shared/auth/services/email.service';
import { AdminNotifierService } from '@root/shared/notifications/admin-notifier.service';
import { UserNotificationService } from '@modules/notifications/services/implementation/user-notification.service';
import { EventChangeService } from './services/implementation/event-change.service';
import { CloseEndedEventSalesProcessor } from './processors/close-ended-event-sales.processor';

/** BR-EVENT-013: el job corre cada minuto; el gate de compra es la otra línea de defensa. */
const CLOSE_SALES_INTERVAL_MS = 60 * 1000;

/**
 * Worker de ciclo de vida del evento (cierre automático de venta).
 * Va aparte de ControllerModule/ServiceModule porque corre sin request HTTP.
 */
@Module({
  imports: [
    DBModule,
    EnvModule,
    HttpModule,
    NotificationsModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.EVENT_LIFECYCLE })
  ],
  providers: [
    UserPermissionService,
    EventChangeService,
    CloseEndedEventSalesProcessor,
    // Este módulo arma su propio `EventChangeService`, así que tiene que
    // proveer todo lo que inyecta: el aviso al Admin por cancelación o cambio
    // material sale de ahí.
    EmailService,
    AdminNotifierService,
    { provide: 'IUserNotificationService', useClass: UserNotificationService }
  ],
  exports: [EventChangeService]
})
export class EventLifecycleModule implements OnModuleInit {
  private readonly logger = new Logger(EventLifecycleModule.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.EVENT_LIFECYCLE) private readonly lifecycleQueue: Queue
  ) {}

  async onModuleInit(): Promise<void> {
    await this.lifecycleQueue.upsertJobScheduler(
      'close-ended-event-sales-every-1m',
      { every: CLOSE_SALES_INTERVAL_MS },
      { name: 'close-ended-event-sales', data: { batchSize: 200 } }
    );

    this.logger.log('Scheduler de cierre de venta registrado: cada 1 minuto');
  }
}
