import { Inject, Logger } from '@nestjs/common';
import { InjectQueue, OnQueueEvent, QueueEventsHost, QueueEventsListener } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DBRepository } from '@config/db/db.repository';
import { QUEUE_NAMES } from '@config/redis/bull-jobs.types';
import { RedisService } from '@config/redis/redis.service';
import { AdminNotifierService } from '@root/shared/notifications/admin-notifier.service';

/**
 * Un aviso por orden alcanza: si fallan las tres entradas de una compra, al
 * Admin le sirve un solo mensaje, no tres. La ventana cubre los reintentos.
 */
const ALERT_DEDUPE_TTL_SECONDS = 6 * 60 * 60;

type FailedEvent = { jobId: string; failedReason: string };

/**
 * Base común: escucha los jobs que terminaron fallando **del todo** y avisa al
 * Admin que una compra pagada se quedó sin sus entradas.
 *
 * Se escucha con `QueueEvents` y no dentro del processor a propósito: el
 * processor vive en módulos que no pueden depender de `AdminNotifierService`
 * sin armar un ciclo, y además `QueueEvents` ve el fallo aunque el worker que
 * lo procesó sea otra réplica.
 */
abstract class DeliveryFailureListener extends QueueEventsHost {
  protected abstract readonly logger: Logger;
  protected abstract readonly queue: Queue;
  protected abstract readonly queueLabel: string;
  protected abstract describeFailure(jobName: string): string | null;

  constructor(
    protected readonly dbRepository: DBRepository,
    protected readonly redisService: RedisService,
    protected readonly adminNotifier: AdminNotifierService
  ) {
    super();
  }

  protected async handleFailed({ jobId, failedReason }: FailedEvent): Promise<void> {
    try {
      const job = await this.queue.getJob(jobId);
      if (!job) return;

      // `failed` también se emite en intentos que van a reintentarse; lo que
      // importa es el fallo definitivo.
      if ((await job.getState()) !== 'failed') return;

      const what = this.describeFailure(job.name);
      if (!what) return;

      const orderId = (job.data as { orderId?: string })?.orderId;
      if (!orderId) return;

      const first = await this.redisService.markIdempotency(
        `admin-alert:delivery-failed:${this.queueLabel}:${orderId}`,
        ALERT_DEDUPE_TTL_SECONDS
      );
      if (!first) return;

      const order = (await this.dbRepository.findOne({
        entity: 'orders',
        where: { uuid: orderId },
        relations: { event: true }
      })) as { orderNumber?: string; event?: { name?: string } } | null;

      const orderLabel = order?.orderNumber ? `la orden ${order.orderNumber}` : `la orden ${orderId}`;
      const eventLabel = order?.event?.name ? ` de ${order.event.name}` : '';

      await this.adminNotifier.notifyAdmins(
        'Entradas que no salieron',
        `${what} de ${orderLabel}${eventLabel} después de agotar los reintentos. ` +
          `Motivo: ${failedReason || 'sin detalle'}. Desde el detalle de la venta se puede ` +
          'regenerar la entrada o reenviar el email.',
        { email: { actionPath: '/admin/sales', actionLabel: 'Ver ventas' } }
      );
    } catch (error) {
      // Es un aviso: si falla, el error del job ya quedó en el log.
      this.logger.error(
        `No se pudo avisar el fallo del job ${jobId}`,
        error instanceof Error ? error.stack : String(error)
      );
    }
  }
}

@QueueEventsListener(QUEUE_NAMES.TICKETS)
export class TicketGenerationFailureListener extends DeliveryFailureListener {
  protected readonly logger = new Logger(TicketGenerationFailureListener.name);
  protected readonly queueLabel = 'tickets';

  constructor(
    @InjectQueue(QUEUE_NAMES.TICKETS) protected readonly queue: Queue,
    @Inject(DBRepository) dbRepository: DBRepository,
    redisService: RedisService,
    adminNotifier: AdminNotifierService
  ) {
    super(dbRepository, redisService, adminNotifier);
  }

  protected describeFailure(jobName: string): string | null {
    return jobName === 'generate-qr' ? 'No se pudo generar el QR/PDF de una entrada' : null;
  }

  @OnQueueEvent('failed')
  onFailed(event: FailedEvent): Promise<void> {
    return this.handleFailed(event);
  }
}

@QueueEventsListener(QUEUE_NAMES.NOTIFICATIONS)
export class TicketEmailFailureListener extends DeliveryFailureListener {
  protected readonly logger = new Logger(TicketEmailFailureListener.name);
  protected readonly queueLabel = 'notifications';

  constructor(
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) protected readonly queue: Queue,
    @Inject(DBRepository) dbRepository: DBRepository,
    redisService: RedisService,
    adminNotifier: AdminNotifierService
  ) {
    super(dbRepository, redisService, adminNotifier);
  }

  protected describeFailure(jobName: string): string | null {
    return jobName === 'send-order-tickets-email' ? 'No se pudo enviar el email con las entradas' : null;
  }

  @OnQueueEvent('failed')
  onFailed(event: FailedEvent): Promise<void> {
    return this.handleFailed(event);
  }
}
