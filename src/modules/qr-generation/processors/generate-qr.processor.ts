import { Logger } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { QUEUE_NAMES, GenerateQrJobData, SendTicketEmailJobData } from '@config/redis/bull-jobs.types';
import { TicketEntity } from '@config/db/entities/tickets/ticket.entity';
import { StorageService } from '@root/shared/services/storage.service';
import { QrSigningService } from '../services/qr-signing.service';
import { QrImageService } from '../services/qr-image.service';
import { PdfTicketService } from '../services/pdf-ticket.service';

@Processor(QUEUE_NAMES.TICKETS)
export class GenerateQrProcessor extends WorkerHost {
  private readonly logger = new Logger(GenerateQrProcessor.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly storageService: StorageService,
    private readonly qrSigningService: QrSigningService,
    private readonly qrImageService: QrImageService,
    private readonly pdfTicketService: PdfTicketService,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationsQueue: Queue
  ) {
    super();
  }

  async process(job: Job<GenerateQrJobData>): Promise<void> {
    if (job.name !== 'generate-qr') return;

    const { ticketId } = job.data;

    // ── PASO 1 — Buscar ticket con relaciones ────────────────────────────────

    const ticket = await this.dataSource.getRepository(TicketEntity).findOne({
      where: { uuid: ticketId },
      relations: { orderItem: true, user: true, event: true, ticketType: true }
    });

    if (!ticket) {
      this.logger.error(`Ticket not found: ${ticketId} — skipping (no retry)`);
      return;
    }

    // ── PASO 2 — Idempotencia ────────────────────────────────────────────────

    if (ticket.qrCode !== null) {
      this.logger.warn(`QR already generated for ticket ${ticket.ticketNumber} — skipping duplicate job`);
      return;
    }

    // ── PASO 3 — Generar token QR firmado ───────────────────────────────────

    const token = this.qrSigningService.generateQrToken({
      ticketId: ticket.uuid,
      eventId: ticket.eventUuid,
      ticketNumber: ticket.ticketNumber,
      issuedAt: Date.now()
    });

    // Track saved paths for cleanup on failure
    let qrAbsolutePath: string | null = null;
    let pdfAbsolutePath: string | null = null;

    try {
      // ── PASO 4 — Generar imagen QR ─────────────────────────────────────────

      const qrImageBuffer = await this.qrImageService.generateQrImage(token);

      // ── PASO 5 — Guardar imagen QR en disco ───────────────────────────────

      const { url: qrUrl, absolutePath: qrAbs } = await this.storageService.saveFile({
        buffer: qrImageBuffer,
        relativePath: 'tickets/qr',
        filename: `${ticket.uuid}.png`
      });
      qrAbsolutePath = qrAbs;

      // ── PASO 6 — Generar PDF ───────────────────────────────────────────────

      const pdfBuffer = await this.pdfTicketService.generateTicketPdf({
        ticketNumber: ticket.ticketNumber,
        eventName: ticket.event.name,
        eventDate: ticket.event.startDate,
        eventVenue: ticket.event.venueName,
        eventCity: ticket.event.venueCity,
        ticketTypeName: ticket.ticketType.name,
        holderName: `${ticket.user.firstName} ${ticket.user.lastName}`,
        orderId: ticket.orderItem.orderUuid,
        qrImageBuffer
      });

      // ── PASO 7 — Guardar PDF en disco ─────────────────────────────────────

      const { url: pdfUrl, absolutePath: pdfAbs } = await this.storageService.saveFile({
        buffer: pdfBuffer,
        relativePath: 'tickets/pdf',
        filename: `${ticket.uuid}.pdf`
      });
      pdfAbsolutePath = pdfAbs;

      // ── PASO 8 — Actualizar ticket en MySQL ───────────────────────────────

      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      try {
        await queryRunner.manager.update(TicketEntity, { uuid: ticket.uuid }, { qrCode: token, qrUrl, pdfUrl });
        await queryRunner.commitTransaction();
      } catch (err) {
        await queryRunner.rollbackTransaction();
        throw err;
      } finally {
        await queryRunner.release();
      }

      // ── PASO 9 — Encolar notificación ─────────────────────────────────────

      const emailJob: SendTicketEmailJobData = {
        userId: ticket.userUuid,
        orderId: ticket.orderItem.orderUuid,
        email: ticket.user.email,
        eventName: ticket.event.name,
        ticketNumber: ticket.ticketNumber,
        qrUrl,
        pdfUrl
      };
      await this.notificationsQueue.add('send-ticket-email', emailJob);

      // ── PASO 10 — Loguear éxito ───────────────────────────────────────────

      this.logger.log(`QR generated for ticket ${ticket.ticketNumber} | qr=${qrUrl} | pdf=${pdfUrl}`);
    } catch (err) {
      // Cleanup archivos ya guardados antes de relanzar para que BullMQ reintente limpio
      await Promise.allSettled([
        qrAbsolutePath ? this.storageService.deleteFile(qrAbsolutePath) : Promise.resolve(),
        pdfAbsolutePath ? this.storageService.deleteFile(pdfAbsolutePath) : Promise.resolve()
      ]);

      this.logger.error(
        `Failed to generate QR for ticket ${ticket.ticketNumber}`,
        err instanceof Error ? err.stack : String(err)
      );
      throw err;
    }
  }
}
