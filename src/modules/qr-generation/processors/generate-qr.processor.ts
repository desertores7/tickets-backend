import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  QUEUE_NAMES,
  GenerateQrJobData,
  SendOrderTicketsEmailJobData
} from '@config/redis/bull-jobs.types';
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

  /**
   * Encola el email de la orden si esta entrada era la última que faltaba.
   *
   * Se apoya en la base y no en un contador: `pdfUrl IS NULL` responde con
   * exactitud "¿queda alguna sin generar?" sin importar cuántas veces se haya
   * reintentado ni en qué orden terminaron los jobs.
   */
  private async enqueueOrderEmailIfComplete(orderUuid: string | null | undefined): Promise<void> {
    if (!orderUuid) return;

    try {
      const row = await this.dataSource
        .createQueryBuilder()
        .select('COUNT(*)', 'pendientes')
        .from('ticket', 't')
        .innerJoin('order_item', 'oi', 'oi.uuid = t.orderItemUuid')
        .where('oi.orderUuid = :orderUuid', { orderUuid })
        .andWhere('t.pdfUrl IS NULL')
        .getRawOne<{ pendientes: string }>();

      if (Number(row?.pendientes ?? 0) > 0) return;

      const jobData: SendOrderTicketsEmailJobData = { orderId: orderUuid };
      await this.notificationsQueue.add('send-order-tickets-email', jobData, {
        attempts: 6,
        backoff: { type: 'exponential', delay: 10000 }
      });

      this.logger.log(`Orden ${orderUuid} completa: email de entradas encolado`);
    } catch (error) {
      // Un fallo acá no puede tirar abajo la generación del QR, que ya terminó
      // bien. El job con delay de `confirmPayment` sigue siendo el otro camino.
      this.logger.error(
        `No se pudo encolar el email de la orden ${orderUuid}`,
        error instanceof Error ? error.stack : String(error)
      );
    }
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

      // El email de la orden lo encola `confirmPayment` con un delay, pero esa
      // ventana de reintentos dura unos 5 minutos. Si la generación tarda más
      // —un redeploy que reinicia el worker a mitad de camino alcanza— el job
      // se agota y el comprador se queda sin sus entradas para siempre.
      //
      // Por eso, además, se dispara por evento: cuando esta entrada era la
      // última que faltaba de la orden, se encola el email ahí mismo. El
      // processor descarta el duplicado por idempotencia.
      await this.enqueueOrderEmailIfComplete(ticket.orderItem.orderUuid);

      // ── PASO 9 — Loguear éxito ────────────────────────────────────────────

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
