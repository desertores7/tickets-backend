import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DBModule } from '@config/db/db.module';
import { QUEUE_NAMES } from '@config/redis/bull-jobs.types';
import { NotificationEmailService } from './services/implementation/notification-email.service';
import { SendOrderTicketsEmailProcessor } from './processors/send-order-tickets-email.processor';

@Module({
  imports: [DBModule, BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATIONS })],
  providers: [NotificationEmailService, SendOrderTicketsEmailProcessor],
  exports: [NotificationEmailService]
})
export class NotificationsModule {}
