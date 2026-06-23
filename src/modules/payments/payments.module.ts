import { Module } from '@nestjs/common';
import { DBModule } from '@config/db/db.module';
import { ServiceModule } from '../service.module';
import { ProcessWebhookProcessor } from './processors/process-webhook.processor';

@Module({
  imports: [DBModule, ServiceModule],
  providers: [ProcessWebhookProcessor]
})
export class PaymentsModule {}
