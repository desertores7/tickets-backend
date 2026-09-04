import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES, ProcessRefundQueueJobData } from '@config/redis/bull-jobs.types';
import { IRefundService } from '../services/contracts/irefund.service';

/**
 * Cron de evaluación de solicitudes de reembolso (`BR-REFUND-011`).
 *
 * Cada corrida hace dos cosas: evalúa las `pending` —aprobando o rechazando sin
 * cola humana— y consulta en Mercado Pago las que quedaron `processing`.
 *
 * **Nunca reenvía un refund ya mandado.** Reintentar sobre uno que en realidad
 * salió devuelve el dinero dos veces, así que las `failed` esperan a que un
 * Administrador las reintente a mano.
 */
@Processor(QUEUE_NAMES.REFUNDS)
export class ProcessRefundQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(ProcessRefundQueueProcessor.name);

  constructor(@Inject('IRefundService') private readonly refundService: IRefundService) {
    super();
  }

  async process(job: Job<ProcessRefundQueueJobData>): Promise<void> {
    if (job.name !== 'process-refund-queue') return;

    try {
      const r = await this.refundService.processQueue();

      // Sin nada que hacer no se loguea: el job corre cada 15 minutos las 24 h.
      if (r.evaluated === 0 && r.processing === 0) return;

      this.logger.log(
        `Reembolsos: evaluadas=${r.evaluated} aprobadas=${r.approved} rechazadas=${r.rejected} ` +
          `pagadas=${r.refunded} en curso=${r.processing} fallidas=${r.failed}`
      );

      if (r.failed > 0) {
        this.logger.warn(
          `${r.failed} reembolso(s) quedaron en failed y necesitan revisión manual del Admin`
        );
      }
    } catch (error) {
      // No se relanza: que falle una corrida no debe marcar el job como muerto.
      // Cada solicitud conserva su estado y la próxima corrida sigue desde ahí.
      this.logger.error(
        `Corrida de reembolsos abortada: ${error instanceof Error ? error.message : error}`
      );
    }
  }
}
