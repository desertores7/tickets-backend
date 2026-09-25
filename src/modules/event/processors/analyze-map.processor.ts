import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { AnalyzeMapJobData, QUEUE_NAMES } from '@config/redis/bull-jobs.types';
import { IEventAiService } from '../services/contracts/ievent-ai.service';
import { MapAnalysisJobStore } from '../services/implementation/map-analysis-job.store';

/**
 * Worker del análisis de mapas (cola EVENT_AI).
 *
 * `POST /events/ai/from-map` encola acá y responde 202 al toque: el análisis
 * (vision → verificación → reparación) tarda 30-60s, bastante más de lo que
 * el proxy server-side de Next.js (`rewrites()` en `next.config.ts`) banca
 * una conexión abierta — cortaba la request con "socket hang up" antes de
 * que el backend llegara a responder. El frontend consulta el resultado con
 * `GET /events/ai/from-map/:jobId` (polling).
 */
@Processor(QUEUE_NAMES.EVENT_AI)
export class AnalyzeMapProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalyzeMapProcessor.name);

  constructor(
    @Inject('IEventAiService') private readonly eventAiService: IEventAiService,
    private readonly jobStore: MapAnalysisJobStore
  ) {
    super();
  }

  async process(job: Job<AnalyzeMapJobData>): Promise<void> {
    if (job.name !== 'analyze-map') return;

    const { jobId, userId, imageBase64, imageName, imageMime, imageSize, eventUuid } = job.data;
    const startedAt = new Date().toISOString();

    try {
      // El worker reconstruye el archivo tal como lo recibió el controller: el
      // servicio de análisis no sabe si vino de un request o de una cola.
      const buffer = Buffer.from(imageBase64, 'base64');
      // Solo los campos que el análisis mira. El resto de Express.Multer.File
      // son cosas del request HTTP que acá no existen.
      const file = {
        buffer,
        size: imageSize,
        mimetype: imageMime,
        originalname: imageName
      } as unknown as Express.Multer.File;

      const result = await this.eventAiService.analyzeFromMapImage(file, userId, eventUuid ?? undefined);

      await this.jobStore.save({
        jobId,
        userId,
        status: 'done',
        startedAt,
        result,
        // Si quedaron advertencias, la reparación no alcanzó. El mapa se
        // entrega igual: incompleto sirve más que nada, y el productor lo
        // termina en el editor.
        repaired: result.warnings.length === 0
      });

      this.logger.log(`Análisis ${jobId} terminado (${result.layout.groups.length} grupos)`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo analizar el mapa.';

      await this.jobStore.save({
        jobId,
        userId,
        status: 'failed',
        startedAt,
        error: message
      });

      this.logger.error(`Análisis ${jobId} fallido: ${message}`);
      // No se relanza: el estado ya quedó en 'failed' y con attempts: 1 un
      // reintento automático solo duplicaría el gasto.
    } finally {
      await this.jobStore.releaseUserLock(userId);
    }
  }
}
