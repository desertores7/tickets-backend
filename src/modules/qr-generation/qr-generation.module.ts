import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DBModule } from '@config/db/db.module';
import { QUEUE_NAMES, CleanupExpiredAssetsJobData } from '@config/redis/bull-jobs.types';
import { RoleGuard } from '@root/shared/auth/guards/role.guard';
import { QrSigningService } from './services/qr-signing.service';
import { QrImageService } from './services/qr-image.service';
import { PdfTicketService } from './services/pdf-ticket.service';
import { GenerateQrProcessor } from './processors/generate-qr.processor';
import { CleanupExpiredAssetsProcessor } from './processors/cleanup-expired-assets.processor';
import { AdminTicketController, TicketController } from './controllers/ticket.controller';

/** Días de gracia después de event.endDate antes de borrar los QR/PDF del storage */
const CLEANUP_GRACE_DAYS = 30;

@Module({
  imports: [
    DBModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.TICKETS }),
    BullModule.registerQueue({ name: QUEUE_NAMES.MAINTENANCE })
  ],
  controllers: [TicketController, AdminTicketController],
  providers: [QrSigningService, QrImageService, PdfTicketService, GenerateQrProcessor, CleanupExpiredAssetsProcessor, RoleGuard],
  exports: [QrSigningService, QrImageService, PdfTicketService]
})
export class QrGenerationModule implements OnModuleInit {
  private readonly logger = new Logger(QrGenerationModule.name);

  constructor(@InjectQueue(QUEUE_NAMES.MAINTENANCE) private readonly maintenanceQueue: Queue) {}

  async onModuleInit(): Promise<void> {
    const jobData: CleanupExpiredAssetsJobData = { graceDays: CLEANUP_GRACE_DAYS };

    // Job recurrente: todos los días a las 04:00 (hora del servidor, TZ del contenedor).
    // upsertJobScheduler es idempotente — reinicios/redeploys no duplican el scheduler.
    await this.maintenanceQueue.upsertJobScheduler(
      'cleanup-expired-assets-daily',
      { pattern: '0 4 * * *' },
      { name: 'cleanup-expired-assets', data: jobData }
    );

    this.logger.log(`Cleanup scheduler registered: daily at 04:00, grace period ${CLEANUP_GRACE_DAYS} days`);
  }
}
