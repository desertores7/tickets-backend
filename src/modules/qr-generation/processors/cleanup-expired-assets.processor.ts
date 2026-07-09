import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { QUEUE_NAMES, CleanupExpiredAssetsJobData } from '@config/redis/bull-jobs.types';
import { TicketEntity } from '@config/db/entities/tickets/ticket.entity';
import { StorageService } from '@root/shared/services/storage.service';

/** Máximo de tickets procesados por corrida — lo que sobre se limpia en la corrida siguiente */
const BATCH_SIZE = 1000;

@Processor(QUEUE_NAMES.MAINTENANCE)
export class CleanupExpiredAssetsProcessor extends WorkerHost {
  private readonly logger = new Logger(CleanupExpiredAssetsProcessor.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly storageService: StorageService
  ) {
    super();
  }

  async process(job: Job<CleanupExpiredAssetsJobData>): Promise<void> {
    if (job.name !== 'cleanup-expired-assets') return;

    const graceDays = job.data.graceDays ?? 30;
    const cutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000);

    this.logger.log(`Cleanup started: removing QR/PDF assets for events ended before ${cutoff.toISOString()}`);

    // Tickets de eventos terminados hace más de graceDays que aún tienen archivos.
    // Se borran solo los archivos y las URLs — ticket, qrCode y check_in_log se
    // conservan como historial (el QR/PDF es regenerable desde qrCode si hace falta).
    const tickets = await this.dataSource
      .getRepository(TicketEntity)
      .createQueryBuilder('t')
      .innerJoin('t.event', 'e')
      .where('e.endDate < :cutoff', { cutoff })
      .andWhere('(t.qrUrl IS NOT NULL OR t.pdfUrl IS NOT NULL)')
      .select(['t.uuid'])
      .take(BATCH_SIZE)
      .getMany();

    if (tickets.length === 0) {
      this.logger.log('Cleanup finished: no expired assets to remove');
      return;
    }

    let cleaned = 0;
    let failed = 0;

    for (const ticket of tickets) {
      try {
        const qrPath = this.storageService.resolveAbsolutePath('tickets/qr', `${ticket.uuid}.png`);
        const pdfPath = this.storageService.resolveAbsolutePath('tickets/pdf', `${ticket.uuid}.pdf`);

        await Promise.allSettled([this.storageService.deleteFile(qrPath), this.storageService.deleteFile(pdfPath)]);

        await this.dataSource
          .getRepository(TicketEntity)
          .update({ uuid: ticket.uuid }, { qrUrl: null, pdfUrl: null });

        cleaned++;
      } catch (err) {
        failed++;
        this.logger.error(
          `Cleanup failed for ticket ${ticket.uuid} — will retry on next run`,
          err instanceof Error ? err.stack : String(err)
        );
      }
    }

    this.logger.log(
      `Cleanup finished: ${cleaned} tickets cleaned, ${failed} failed` +
        (tickets.length === BATCH_SIZE ? ` (batch limit reached — remainder on next run)` : '')
    );
  }
}
