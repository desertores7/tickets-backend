import * as crypto from 'crypto';
import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { EnvService } from '@config/env/env.service';
import { QUEUE_NAMES, GenerateQrJobData } from '@config/redis/bull-jobs.types';

@Processor(QUEUE_NAMES.TICKETS)
export class GenerateQrProcessor extends WorkerHost {
  private readonly logger = new Logger(GenerateQrProcessor.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly envService: EnvService
  ) {
    super();
  }

  async process(job: Job<GenerateQrJobData>): Promise<void> {
    if (job.name !== 'generate-qr') return;

    const { ticketId, orderId, userId, eventId } = job.data;

    const secret = this.envService.get('JWT_SECRET') ?? 'fallback-qr-secret';
    const qrCode = crypto
      .createHmac('sha256', secret)
      .update(`${ticketId}:${orderId}:${userId}:${eventId}`)
      .digest('hex');

    try {
      await this.dataSource.query('UPDATE ticket SET qrCode = ? WHERE uuid = ?', [qrCode, ticketId]);
      this.logger.log(`QR generated for ticket ${ticketId} (${qrCode.substring(0, 12)}…)`);
    } catch (error) {
      this.logger.error(
        `Failed to write QR for ticket ${ticketId}`,
        error instanceof Error ? error.stack : String(error)
      );
      throw error;
    }
  }
}
