import { Module } from '@nestjs/common';
import { DBModule } from '@config/db/db.module';
import { ServiceModule } from '../service.module';
import { ReleaseExpiredStockProcessor } from './processors/release-expired-stock.processor';

@Module({
  imports: [DBModule, ServiceModule],
  providers: [ReleaseExpiredStockProcessor]
})
export class OrdersModule {}
