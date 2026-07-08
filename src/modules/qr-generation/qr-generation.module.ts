import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DBModule } from '@config/db/db.module';
import { QUEUE_NAMES } from '@config/redis/bull-jobs.types';
import { RoleGuard } from '@root/shared/auth/guards/role.guard';
import { QrSigningService } from './services/qr-signing.service';
import { QrImageService } from './services/qr-image.service';
import { PdfTicketService } from './services/pdf-ticket.service';
import { GenerateQrProcessor } from './processors/generate-qr.processor';
import { AdminTicketController, TicketController } from './controllers/ticket.controller';

@Module({
  imports: [
    DBModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.TICKETS }),
    BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATIONS })
  ],
  controllers: [TicketController, AdminTicketController],
  providers: [QrSigningService, QrImageService, PdfTicketService, GenerateQrProcessor, RoleGuard],
  exports: [QrSigningService, QrImageService, PdfTicketService]
})
export class QrGenerationModule {}
