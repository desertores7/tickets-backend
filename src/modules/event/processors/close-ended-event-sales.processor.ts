import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES, CloseEndedEventSalesJobData } from '@config/redis/bull-jobs.types';
import { EventChangeService } from '../services/implementation/event-change.service';

/**
 * Cierre automático de venta al fin del evento (BR-EVENT-013).
 * Una queue = un processor; el gate de compra también rechaza post-endDate.
 */
@Processor(QUEUE_NAMES.EVENT_LIFECYCLE)
export class CloseEndedEventSalesProcessor extends WorkerHost {
  private readonly logger = new Logger(CloseEndedEventSalesProcessor.name);

  constructor(private readonly eventChangeService: EventChangeService) {
    super();
  }

  async process(job: Job<CloseEndedEventSalesJobData>): Promise<void> {
    if (job.name !== 'close-ended-event-sales') return;

    const batchSize = job.data.batchSize ?? 200;
    const closed = await this.eventChangeService.closeSalesForEndedEvents(batchSize);
    if (closed > 0) {
      this.logger.log(`close-ended-event-sales: ${closed} evento(s) cerrados`);
    }
  }
}
