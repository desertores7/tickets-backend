import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DBModule } from '@config/db/db.module';
import { QUEUE_NAMES, SweepExpiredOrdersJobData } from '@config/redis/bull-jobs.types';
import { ServiceModule } from '../service.module';
import { ReleaseExpiredStockProcessor } from './processors/release-expired-stock.processor';

/** Órdenes vencidas que revisa cada corrida del barrido. */
const SWEEP_BATCH_SIZE = 100;

@Module({
  imports: [DBModule, ServiceModule, BullModule.registerQueue({ name: QUEUE_NAMES.ORDERS })],
  providers: [ReleaseExpiredStockProcessor]
})
export class OrdersModule implements OnModuleInit {
  private readonly logger = new Logger(OrdersModule.name);

  constructor(@InjectQueue(QUEUE_NAMES.ORDERS) private readonly ordersQueue: Queue) {}

  async onModuleInit(): Promise<void> {
    const jobData: SweepExpiredOrdersJobData = { batchSize: SWEEP_BATCH_SIZE };

    // Cada 5 minutos: el hold dura 10, así que una orden vencida libera su
    // stock en 5 minutos como mucho, aunque se haya perdido su job con delay.
    // `upsertJobScheduler` es idempotente: los redeploys no lo duplican.
    await this.ordersQueue.upsertJobScheduler(
      'sweep-expired-orders-every-5m',
      { pattern: '*/5 * * * *' },
      { name: 'sweep-expired-orders', data: jobData }
    );

    this.logger.log('Barrido de órdenes vencidas registrado: cada 5 minutos');
  }
}
