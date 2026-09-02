import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DBModule } from '@config/db/db.module';
import { EnvModule } from '@config/env/env.module';
import { QUEUE_NAMES } from '@config/redis/bull-jobs.types';
import { TokenCipher } from '@root/shared/crypto/token-cipher';
import { MpTokenService } from '@root/shared/mercadopago/mp-token.service';
import { MpSyncService } from './services/implementation/mp-sync.service';
import { MpEventSyncProcessor } from './processors/mp-event-sync.processor';

/** `BR-CASH-003`: el job corre ~cada 5 minutos. */
const SYNC_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Job de fondo que copia los movimientos MP durante la ventana del evento.
 *
 * Va aparte del resto de la caja porque es lo único que corre sin request: los
 * endpoints viven en `ControllerModule` / `ServiceModule` y acá solo está el
 * worker.
 */
@Module({
  imports: [
    DBModule,
    EnvModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.MP_SYNC })
  ],
  providers: [TokenCipher, MpTokenService, MpSyncService, MpEventSyncProcessor],
  exports: [MpSyncService]
})
export class EventCashSyncModule implements OnModuleInit {
  private readonly logger = new Logger(EventCashSyncModule.name);

  constructor(@InjectQueue(QUEUE_NAMES.MP_SYNC) private readonly mpSyncQueue: Queue) {}

  async onModuleInit(): Promise<void> {
    // El scheduler dispara siempre; el servicio decide si hay eventos en
    // ventana. Alternar el scheduler según los eventos sería estado extra que
    // se desincroniza con cada alta o cambio de fecha.
    // upsertJobScheduler es idempotente: reinicios y redeploys no lo duplican.
    await this.mpSyncQueue.upsertJobScheduler(
      'mp-event-sync-every-5m',
      { every: SYNC_INTERVAL_MS },
      { name: 'mp-event-sync', data: {} }
    );

    this.logger.log('Scheduler de sync MP registrado: cada 5 minutos');
  }
}
