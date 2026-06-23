import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES, SendTicketEmailJobData } from '@config/redis/bull-jobs.types';

@Processor(QUEUE_NAMES.NOTIFICATIONS)
export class SendTicketEmailProcessor extends WorkerHost {
  private readonly logger = new Logger(SendTicketEmailProcessor.name);

  async process(job: Job<SendTicketEmailJobData>): Promise<void> {
    if (job.name !== 'send-ticket-email') return;

    const { email, userName, eventName, eventDate, venueName, orderId } = job.data;

    // Stub — real email implementation will use EmailService once the template is ready
    this.logger.log(
      `[stub] Ticket email for order=${orderId} → to=${email} user="${userName}" event="${eventName}" date=${eventDate} venue="${venueName}"`
    );
  }
}
