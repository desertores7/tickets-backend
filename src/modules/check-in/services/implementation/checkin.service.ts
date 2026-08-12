import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DBRepository } from '@config/db/db.repository';
import { RedisService } from '@config/redis/redis.service';
import { CheckInResult } from '@config/db/entities/tickets/check_in_log.entity';
import { TicketStatus } from '@config/db/entities/tickets/ticket.entity';
import { QrSigningService } from '@modules/qr-generation/services/qr-signing.service';
import { ICheckInService } from '../contracts/icheckin.service';
import { CheckInResultData, CheckInTicket, CheckInResultEnum } from '../core/checkin';

const CHECKIN_LOCK_TTL = 86400; // 24 horas

@Injectable()
export class CheckInService implements ICheckInService {
  private readonly logger = new Logger(CheckInService.name);

  constructor(
    @Inject(DBRepository) private readonly dbRepository: DBRepository,
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource,
    private readonly qrSigningService: QrSigningService
  ) {}

  async validateQr(
    qrCode: string,
    eventId: string,
    scannedBy: string,
    deviceInfo?: Record<string, unknown>
  ): Promise<CheckInResultData> {
    // 1. Verificar firma criptográfica — bloquea tokens falsos antes de tocar MySQL
    const verification = this.qrSigningService.verifyQrToken(qrCode);

    if (!verification.valid) {
      this.logger.warn(
        `Check-in rechazado: firma inválida (reason=${verification.reason} scannedBy=${scannedBy} eventId=${eventId})`
      );
      await this.writeLog({ ticketUuid: null, eventUuid: eventId, scannedBy, result: CheckInResult.INVALID, deviceInfo });
      return { success: false, message: 'QR inválido o falsificado', result: CheckInResultEnum.INVALID };
    }

    const { ticketId } = verification.payload;

    // 2. Buscar ticket directamente por UUID (más eficiente que buscar por qrCode)
    const ticket = await this.dbRepository.findOne({
      entity: 'ticket',
      where: { uuid: ticketId }
    });

    if (!ticket) {
      this.logger.warn(`Check-in fallido: ticket no encontrado uuid=${ticketId} scannedBy=${scannedBy}`);
      await this.writeLog({ ticketUuid: null, eventUuid: eventId, scannedBy, result: CheckInResult.INVALID, deviceInfo });
      return { success: false, message: 'QR inválido o no registrado', result: CheckInResultEnum.INVALID };
    }

    // 3. El token vigente es el guardado en el ticket. Una firma válida no
    // alcanza: si el QR se regeneró (por una transferencia aceptada o por el
    // endpoint de admin), las copias anteriores quedan revocadas.
    if (ticket.qrCode !== qrCode) {
      this.logger.warn(`Check-in rechazado: QR reemplazado (ticket=${ticket.uuid} scannedBy=${scannedBy})`);
      await this.writeLog({
        ticketUuid: ticket.uuid,
        eventUuid: eventId,
        scannedBy,
        result: CheckInResult.INVALID,
        deviceInfo
      });
      return {
        success: false,
        message: 'Este código fue reemplazado. Pedí la versión actualizada de la entrada.',
        result: CheckInResultEnum.INVALID
      };
    }

    // 4. Verificar que el ticket corresponde al evento correcto
    if (ticket.eventUuid !== eventId) {
      this.logger.warn(`Check-in fallido: ticket ${ticket.uuid} no pertenece al evento ${eventId}`);
      await this.writeLog({ ticketUuid: ticket.uuid, eventUuid: eventId, scannedBy, result: CheckInResult.WRONG_EVENT, deviceInfo });
      return { success: false, message: 'Esta entrada no corresponde a este evento', result: CheckInResultEnum.WRONG_EVENT };
    }

    // 5. Ventana de escaneo: solo el día del evento, hasta que termina.
    // Se abre a las 00:00 de la fecha de inicio (permite acreditación temprana)
    // y se cierra en endDate, para que un show que cruza la medianoche siga
    // aceptando ingresos después de las 00:00.
    const event = await this.dbRepository.findOne({
      entity: 'event',
      where: { uuid: ticket.eventUuid }
    });

    if (!event) {
      this.logger.error(`Check-in fallido: evento ${ticket.eventUuid} no encontrado`);
      await this.writeLog({ ticketUuid: ticket.uuid, eventUuid: eventId, scannedBy, result: CheckInResult.INVALID, deviceInfo });
      return { success: false, message: 'Evento no encontrado', result: CheckInResultEnum.INVALID };
    }

    // Momento del escaneo: se usa tanto para la ventana como para checkedInAt
    const now = new Date();
    const windowStart = new Date(event.startDate);
    windowStart.setHours(0, 0, 0, 0);
    const windowEnd = new Date(event.endDate);

    if (now < windowStart || now > windowEnd) {
      const message =
        now < windowStart
          ? `El check-in habilita el día del evento (${windowStart.toLocaleDateString('es-AR')})`
          : 'El evento ya finalizó';
      this.logger.warn(
        `Check-in fuera de ventana: ticket ${ticket.uuid} (ahora=${now.toISOString()} ventana=${windowStart.toISOString()}..${windowEnd.toISOString()})`
      );
      await this.writeLog({
        ticketUuid: ticket.uuid,
        eventUuid: eventId,
        scannedBy,
        result: CheckInResult.OUTSIDE_WINDOW,
        deviceInfo
      });
      return { success: false, message, result: CheckInResultEnum.OUTSIDE_WINDOW };
    }

    // 6. Verificar que el ticket no fue usado ya (check DB)
    if (ticket.status === TicketStatus.USED) {
      this.logger.log(`Check-in fallido: ticket ${ticket.uuid} ya utilizado (DB)`);
      await this.writeLog({ ticketUuid: ticket.uuid, eventUuid: eventId, scannedBy, result: CheckInResult.ALREADY_USED, deviceInfo });
      return { success: false, message: 'Esta entrada ya fue utilizada', result: CheckInResultEnum.ALREADY_USED };
    }

    // 7. Adquirir lock Redis (previene race condition entre dos validadores simultáneos)
    const lockKey = `checkin:${ticket.uuid}`;
    const acquired = await this.redisService.markIdempotency(lockKey, CHECKIN_LOCK_TTL);

    if (!acquired) {
      this.logger.log(`Check-in fallido: ticket ${ticket.uuid} bloqueado por otro proceso (Redis)`);
      await this.writeLog({ ticketUuid: ticket.uuid, eventUuid: eventId, scannedBy, result: CheckInResult.ALREADY_USED, deviceInfo });
      return { success: false, message: 'Esta entrada ya fue utilizada', result: CheckInResultEnum.ALREADY_USED };
    }

    // 8. Actualizar ticket + crear log en transacción
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager.save('ticket', {
        uuid: ticket.uuid,
        orderItemUuid: ticket.orderItemUuid,
        userUuid: ticket.userUuid,
        eventUuid: ticket.eventUuid,
        ticketTypeUuid: ticket.ticketTypeUuid,
        ticketNumber: ticket.ticketNumber,
        qrCode: ticket.qrCode,
        qrUrl: ticket.qrUrl,
        pdfUrl: ticket.pdfUrl,
        status: TicketStatus.USED,
        checkedInAt: now,
        checkedInBy: scannedBy
      });

      await queryRunner.manager.save('check_in_log', {
        uuid: uuidv4(),
        ticketUuid: ticket.uuid,
        eventUuid: ticket.eventUuid,
        scannedBy,
        scannedAt: now,
        result: CheckInResult.SUCCESS,
        deviceInfo: deviceInfo ?? null
      });

      await queryRunner.commitTransaction();

      this.logger.log(`Check-in exitoso: ticket=${ticket.uuid} scannedBy=${scannedBy}`);

      const updatedTicket: CheckInTicket = {
        uuid: ticket.uuid,
        ticketNumber: ticket.ticketNumber,
        eventUuid: ticket.eventUuid,
        userUuid: ticket.userUuid,
        status: TicketStatus.USED,
        checkedInAt: now,
        checkedInBy: scannedBy
      };

      return { success: true, ticket: updatedTicket, message: 'Check-in exitoso', result: CheckInResultEnum.SUCCESS };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      // Liberar el lock de Redis para que el check-in pueda reintentarse
      await this.redisService.deleteKey(lockKey);
      this.logger.error(`Check-in transacción fallida: ticket=${ticket.uuid}`, err);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // Inserta un registro de log sin afectar el flujo principal (swallow de errores)
  private async writeLog(data: {
    ticketUuid: string | null;
    eventUuid: string;
    scannedBy: string;
    result: CheckInResult;
    deviceInfo?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.dataSource.query(
        'INSERT INTO check_in_log (uuid, ticketUuid, eventUuid, scannedBy, scannedAt, result, deviceInfo) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          uuidv4(),
          data.ticketUuid ?? null,
          data.eventUuid,
          data.scannedBy,
          new Date(),
          data.result,
          data.deviceInfo ? JSON.stringify(data.deviceInfo) : null
        ]
      );
    } catch (err) {
      this.logger.error('Error al insertar check_in_log (swallowed)', err);
    }
  }
}
