import { Module } from '@nestjs/common';
import { DBModule } from '@config/db/db.module';
import { ServiceModule } from '../service.module';
import { ReleaseExpiredStockProcessor } from './processors/release-expired-stock.processor';
import { SendTicketEmailProcessor } from './processors/send-ticket-email.processor';

@Module({
  imports: [DBModule, ServiceModule],
  providers: [ReleaseExpiredStockProcessor, SendTicketEmailProcessor]
})
export class OrdersModule {}
