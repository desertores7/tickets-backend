import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  QUEUE_NAMES,
  ReleaseExpiredStockJobData,
  SweepExpiredOrdersJobData
} from '@config/redis/bull-jobs.types';
import { IOrderService } from '../services/contracts/iorder.service';

type OrdersJobData = ReleaseExpiredStockJobData | SweepExpiredOrdersJobData;

/**
 * Único worker de la queue `orders` — dos jobs distintos, un solo processor.
 *
 * `release-expired-stock` es el camino normal: se encola con delay al crear la
 * orden. `sweep-expired-orders` es la red de contención por si ese job se
 * perdió (ver `OrderService.sweepExpiredOrders`).
 *
 * No se puede partir en dos `@Processor()` sobre la misma queue: competirían
 * por todos los jobs y se perderían en silencio.
 */
@Processor(QUEUE_NAMES.ORDERS)
export class ReleaseExpiredStockProcessor extends WorkerHost {
  private readonly logger = new Logger(ReleaseExpiredStockProcessor.name);

  constructor(@Inject('IOrderService') private readonly orderService: IOrderService) {
    super();
  }

  async process(job: Job<OrdersJobData>): Promise<void> {
    if (job.name === 'sweep-expired-orders') {
      const { batchSize } = job.data as SweepExpiredOrdersJobData;
      await this.orderService.sweepExpiredOrders(batchSize);
      return;
    }

    if (job.name !== 'release-expired-stock') return;

    const { reservationId, ticketTypeId, quantity } = job.data as ReleaseExpiredStockJobData;

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
