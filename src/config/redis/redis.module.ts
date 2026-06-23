import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EnvService } from '@config/env/env.service';
import { RedisService } from './redis.service';
import { QUEUE_NAMES } from './bull-jobs.types';

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000
  },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 }
};

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [EnvService],
      useFactory: (env: EnvService) => {
        const url = env.get('REDIS_URL');
        const connection = url
          ? { url }
          : {
              host: env.get('REDIS_HOST'),
              port: env.get('REDIS_PORT'),
              password: env.get('REDIS_PASSWORD') ?? undefined
            };
        return { connection };
      }
    }),
    BullModule.registerQueue(
      {
        name: QUEUE_NAMES.TICKETS,
        defaultJobOptions: DEFAULT_JOB_OPTIONS
      },
      {
        name: QUEUE_NAMES.NOTIFICATIONS,
        defaultJobOptions: DEFAULT_JOB_OPTIONS
      },
      {
        name: QUEUE_NAMES.PAYMENTS,
        defaultJobOptions: {
          ...DEFAULT_JOB_OPTIONS,
          attempts: 5
        }
      },
      {
        name: QUEUE_NAMES.ORDERS,
        defaultJobOptions: DEFAULT_JOB_OPTIONS
      },
      {
        name: QUEUE_NAMES.WAITING_ROOM,
        defaultJobOptions: {
          ...DEFAULT_JOB_OPTIONS,
          attempts: 2,
          removeOnComplete: { count: 50 }
        }
      }
    )
  ],
  providers: [RedisService],
  exports: [BullModule, RedisService]
})
export class RedisModule {}
