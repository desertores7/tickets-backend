import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@config/redis/bull-jobs.types';
import { MpSyncService } from '../services/implementation/mp-sync.service';

/**
 * Corre la sincronización de movimientos MP (`BR-CASH-003`).
 *
 * El scheduler lo dispara cada ~5 minutos y el servicio decide qué eventos
 * están en ventana: el processor no filtra nada. Tampoco relanza el error —
 * el fallo es silencioso por regla de negocio y ya quedó anotado por cuenta.
 */
@Processor(QUEUE_NAMES.MP_SYNC)
export class MpEventSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(MpEventSyncProcessor.name);

  constructor(private readonly mpSyncService: MpSyncService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'mp-event-sync') return;

    try {
      const result = await this.mpSyncService.syncDueEvents();

      // Sin eventos en ventana no se loguea nada: el job corre cada 5 minutos
      // las 24 horas y llenaría el log de líneas vacías.
      if (result.accountsScanned === 0) return;

      this.logger.log(
        `Sync MP: eventos=${result.eventsScanned} cuentas=${result.accountsScanned} ` +
          `nuevos=${result.movementsCreated} actualizados=${result.movementsUpdated} ` +
          `fallidos=${result.accountsFailed}`
      );
    } catch (error) {
      this.logger.error(
        `Sync MP abortado: ${error instanceof Error ? error.message : error}`
      );
    }
  }
}
