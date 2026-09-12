import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@config/redis/redis.service';
import { AnalyzeMapResult } from '../contracts/ievent-ai.service';

/**
 * Estado de un análisis de mapa en curso.
 *
 * Vive en Redis y no en la memoria del proceso: el productor puede cerrar la
 * pestaña, volver diez minutos después y encontrar el mapa listo, y la API
 * puede correr en más de una instancia sin que el estado dependa de a cuál le
 * tocó atender la consulta.
 */
export type MapAnalysisJobStatus = 'processing' | 'done' | 'failed';

export type MapAnalysisJobState = {
  jobId: string;
  userId: string;
  status: MapAnalysisJobStatus;
  /** ISO de cuando se encoló. El frontend lo usa para el tiempo transcurrido. */
  startedAt: string;
  /** Presente solo con status 'done'. */
  result?: AnalyzeMapResult;
  /** Presente solo con status 'failed'. Texto ya apto para mostrar. */
  error?: string;
  /** true si hizo falta una segunda pasada para completar el mapa. */
  repaired?: boolean;
};

/**
 * Una hora alcanza de sobra: el análisis tarda un par de minutos y el frontend
 * lo consume enseguida. Si el productor tarda más que eso, vuelve a subir.
 */
const JOB_TTL_SEC = 60 * 60;

/**
 * Mientras corre un análisis, el usuario no puede lanzar otro. Es el mismo
 * candado que evita el doble clic y el que impide que dos análisis del mismo
 * productor compitan. Se libera al terminar, y vence solo por las dudas.
 */
const USER_LOCK_TTL_SEC = 15 * 60;

@Injectable()
export class MapAnalysisJobStore {
  private readonly logger = new Logger(MapAnalysisJobStore.name);

  constructor(private readonly redisService: RedisService) {}

  private jobKey(jobId: string): string {
    return `event-ai:map-job:${jobId}`;
  }

  private userLockKey(userId: string): string {
    return `event-ai:map-lock:${userId}`;
  }

  async save(state: MapAnalysisJobState): Promise<void> {
    await this.redisService.setEphemeral(
      this.jobKey(state.jobId),
      JSON.stringify(state),
      JOB_TTL_SEC
    );
  }

  async get(jobId: string): Promise<MapAnalysisJobState | null> {
    const raw = await this.redisService.getEphemeral(this.jobKey(jobId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as MapAnalysisJobState;
    } catch {
      return null;
    }
  }

  /**
   * Marca que el usuario tiene un análisis en curso.
   *
   * Devuelve false si ya había uno: el `SET NX` de markIdempotency hace la
   * comprobación y la reserva en una sola operación, así que dos requests
   * simultáneos no pasan los dos.
   */
  async acquireUserLock(userId: string, jobId: string): Promise<boolean> {
    const acquired = await this.redisService.markIdempotency(
      this.userLockKey(userId),
      USER_LOCK_TTL_SEC
    );
    if (!acquired) return false;

    // El jobId queda aparte para poder devolverle al usuario el análisis que ya
    // tiene corriendo en lugar de un error seco.
    await this.redisService.setEphemeral(
      `${this.userLockKey(userId)}:job`,
      jobId,
      USER_LOCK_TTL_SEC
    );
    return true;
  }

  /** Job en curso de ese usuario, si lo hay. */
  async currentJobId(userId: string): Promise<string | null> {
    return this.redisService.getEphemeral(`${this.userLockKey(userId)}:job`);
  }

  async releaseUserLock(userId: string): Promise<void> {
    try {
      await this.redisService.deleteKey(this.userLockKey(userId));
      await this.redisService.deleteKey(`${this.userLockKey(userId)}:job`);
    } catch (err) {
      // El lock vence solo; que no se pueda borrar no bloquea nada por más de
      // quince minutos.
      this.logger.warn(
        `No se pudo liberar el lock de ${userId}: ${err instanceof Error ? err.message : err}`
      );
    }
  }
}
