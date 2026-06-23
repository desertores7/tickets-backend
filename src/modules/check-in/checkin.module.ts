import { Module } from '@nestjs/common';
import { DBModule } from '@config/db/db.module';
import { ServiceModule } from '../service.module';

@Module({
  imports: [DBModule, ServiceModule]
})
export class CheckInModule {}
