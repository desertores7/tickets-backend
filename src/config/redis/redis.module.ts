import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EnvService } from '@config/env/env.service';
import { RedisService } from './redis.service';
import { QUEUE_NAMES } from './bull-jobs.types';
import { resolveRedisConnection, toBullMqConnection } from './redis.connection';

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
      useFactory: (env: EnvService) => ({
        connection: toBullMqConnection(resolveRedisConnection(env))
      })
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
      },
      {
        name: QUEUE_NAMES.MAINTENANCE,
        defaultJobOptions: {
          ...DEFAULT_JOB_OPTIONS,
          attempts: 1,
          removeOnComplete: { count: 30 }
        }
      }
    )
  ],
  providers: [RedisService],
  exports: [BullModule, RedisService]
})
export class RedisModule {}
