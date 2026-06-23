import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES, ReleaseExpiredStockJobData } from '@config/redis/bull-jobs.types';
import { IOrderService } from '../services/contracts/iorder.service';

@Processor(QUEUE_NAMES.ORDERS)
export class ReleaseExpiredStockProcessor extends WorkerHost {
  private readonly logger = new Logger(ReleaseExpiredStockProcessor.name);

  constructor(@Inject('IOrderService') private readonly orderService: IOrderService) {
    super();
  }

  async process(job: Job<ReleaseExpiredStockJobData>): Promise<void> {
    if (job.name !== 'release-expired-stock') return;

    const { reservationId, ticketTypeId, quantity } = job.data;

    this.logger.log(`Processing release-expired-stock — orderId=${reservationId} ticketTypeId=${ticketTypeId} qty=${quantity}`);

    try {
      await this.orderService.expireOrder(reservationId);
      this.logger.log(`Order ${reservationId} expired successfully`);
    } catch (error) {
      this.logger.error(
        `Failed to expire order ${reservationId}`,
        error instanceof Error ? error.stack : String(error)
      );
      throw error;
    }
  }
}
