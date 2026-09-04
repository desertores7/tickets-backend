import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DBModule } from '@config/db/db.module';
import { EnvModule } from '@config/env/env.module';
import { QUEUE_NAMES } from '@config/redis/bull-jobs.types';
import { EmailService } from '@root/shared/auth/services/email.service';
import { UserPermissionService } from '@root/shared/services/userPermissions.service';
import { RefundService } from './services/implementation/refund.service';
import { ProcessRefundQueueProcessor } from './processors/process-refund-queue.processor';

/**
 * `BR-REFUND-011`: cada 15 minutos.
 *
 * El compromiso con el comprador son 48 h (`BR-REFUND-005`), así que no hace
 * falta más seguido; 15 minutos se siente inmediato sin castigar la API de MP.
 */
const REFUND_QUEUE_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Worker de reembolsos. Va aparte de ControllerModule/ServiceModule porque
 * corre sin request HTTP.
 */
@Module({
  imports: [
    DBModule,
    EnvModule,
    HttpModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.REFUNDS })
  ],
  providers: [
    { provide: 'IRefundService', useClass: RefundService },
    EmailService,
    UserPermissionService,
    ProcessRefundQueueProcessor
  ],
  exports: [{ provide: 'IRefundService', useClass: RefundService }]
})
export class RefundsModule implements OnModuleInit {
  private readonly logger = new Logger(RefundsModule.name);

  constructor(@InjectQueue(QUEUE_NAMES.REFUNDS) private readonly refundsQueue: Queue) {}

  async onModuleInit(): Promise<void> {
    // upsertJobScheduler es idempotente: reinicios y redeploys no lo duplican.
    await this.refundsQueue.upsertJobScheduler(
      'process-refund-queue-every-15m',
      { every: REFUND_QUEUE_INTERVAL_MS },
      { name: 'process-refund-queue', data: { batchSize: 50 } }
    );

    this.logger.log('Scheduler de reembolsos registrado: cada 15 minutos');
  }
}
