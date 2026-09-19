import { readFile } from 'fs/promises';
import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import sharp from 'sharp';
import { DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  QUEUE_NAMES,
  GenerateQrJobData,
  SendOrderTicketsEmailJobData
} from '@config/redis/bull-jobs.types';
import { TicketEntity } from '@config/db/entities/tickets/ticket.entity';
import { EventEntity } from '@config/db/entities/tickets/event.entity';
import { StorageService } from '@root/shared/services/storage.service';
import { QrSigningService } from '../services/qr-signing.service';
import { QrImageService } from '../services/qr-image.service';
import { PdfTicketService } from '../services/pdf-ticket.service';

/**
 * Portada del PDF, en pixeles.
 *
 * El doble del rectangulo que dibuja `PdfTicketService` (420x134 puntos), para
 * que impresa a 144dpi no se vea pixelada. Mas que eso solo engorda el adjunto:
 * cada entrada de la orden lleva su propia copia.
 */
const FLYER_WIDTH = 840;
const FLYER_HEIGHT = 268;

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
   * Banner del evento, listo para meter en el PDF.
   *
   * Se lee del disco y se pasa por sharp por dos motivos: pdfkit solo entiende
   * JPEG y PNG —un banner WebP reventaria la generacion de la entrada— y el
   * original pesa varios MB, que multiplicados por las entradas de la orden
   * terminan en un email que el servidor rechaza. Sale recortado al rectangulo
   * exacto del encabezado, asi el PDF no tiene que deformar nada.
   *
   * Devuelve null ante cualquier problema: una entrada sin portada se entrega
   * igual, una entrada que no se genera deja al comprador afuera.
   */
  private async loadEventFlyer(event: EventEntity): Promise<Buffer | null> {
    const stored = event.bannerImages?.desktop ?? event.bannerUrl ?? null;

    try {
      const pathname = this.storageService.staticPathname(stored);
      if (!pathname) return null;

      const relative = pathname.replace(/^\/static\//, '');
      const slash = relative.lastIndexOf('/');
      const directory = slash >= 0 ? relative.slice(0, slash) : '';
      const filename = decodeURIComponent(slash >= 0 ? relative.slice(slash + 1) : relative);
      if (!filename || filename.includes('..')) return null;

      const absolutePath = this.storageService.resolveAbsolutePath(directory, filename);
      if (!(await this.storageService.fileExists(absolutePath))) return null;

      const original = await readFile(absolutePath);

      return await sharp(original)
        .rotate()
        .resize(FLYER_WIDTH, FLYER_HEIGHT, { fit: 'cover', position: 'attention' })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
    } catch (error) {
      this.logger.warn(
        `No se pudo preparar la portada del evento ${event.uuid} para el PDF: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
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

    // Ya generado **y con los archivos en su lugar**: recién ahí es un duplicado.
    //
    // Mirar solo `qrCode` dejaba entradas irrecuperables: si la fila quedó
    // marcada como generada pero el PDF no está en el disco, todo reintento
    // salía por acá sin hacer nada, y el comprador se quedaba con un botón de
    // descarga que devuelve 404 para siempre. Con la verificación, el reintento
    // —y el endpoint admin de regeneración— vuelven a escribir los archivos.
    if (ticket.qrCode !== null) {
      const [tieneQr, tienePdf] = await Promise.all([
        this.storageService.fileExists(
          this.storageService.resolveAbsolutePath('tickets/qr', `${ticket.uuid}.png`)
        ),
        this.storageService.fileExists(
          this.storageService.resolveAbsolutePath('tickets/pdf', `${ticket.uuid}.pdf`)
        )
      ]);

      if (tieneQr && tienePdf) {
        this.logger.warn(`QR already generated for ticket ${ticket.ticketNumber} — skipping duplicate job`);
        return;
      }

      this.logger.warn(
        `Ticket ${ticket.ticketNumber} figura generado pero faltan archivos (qr=${tieneQr} pdf=${tienePdf}) — se regenera`
      );
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
    /**
     * Una vez commiteada la transacción, la base referencia esos archivos: si
     * después falla cualquier cosa, borrarlos deja al ticket apuntando a un
     * PDF inexistente y el comprador ve un 404 para siempre. La limpieza solo
     * tiene sentido mientras los archivos todavía no le pertenecen a nadie.
     */
    let ticketPersistido = false;

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

      const flyerImageBuffer = await this.loadEventFlyer(ticket.event);

      const pdfBuffer = await this.pdfTicketService.generateTicketPdf({
        ticketNumber: ticket.ticketNumber,
        eventName: ticket.event.name,
        eventDate: ticket.event.startDate,
        eventVenue: ticket.event.venueName,
        eventCity: ticket.event.venueCity,
        eventAddress: ticket.event.venueAddress,
        ticketTypeName: ticket.ticketType.name,
        unitLabel: ticket.unitLabel ?? null,
        holderName: `${ticket.user.firstName} ${ticket.user.lastName}`,
        orderId: ticket.orderItem.orderUuid,
        qrImageBuffer,
        flyerImageBuffer
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
        ticketPersistido = true;
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
      // Cleanup de los archivos ya guardados para que BullMQ reintente limpio,
      // **solo si la base todavía no los referencia** (ver `ticketPersistido`).
      if (!ticketPersistido) {
        await Promise.allSettled([
          qrAbsolutePath ? this.storageService.deleteFile(qrAbsolutePath) : Promise.resolve(),
          pdfAbsolutePath ? this.storageService.deleteFile(pdfAbsolutePath) : Promise.resolve()
        ]);
      }

      this.logger.error(
        `Failed to generate QR for ticket ${ticket.ticketNumber}`,
        err instanceof Error ? err.stack : String(err)
      );
      throw err;
    }
  }
}
