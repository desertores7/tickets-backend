import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DBRepository } from '@config/db/db.repository';
import { RedisService } from '@config/redis/redis.service';
import { CheckInResult } from '@config/db/entities/tickets/check_in_log.entity';
import { TicketStatus } from '@config/db/entities/tickets/ticket.entity';
import { ICheckInService } from '../contracts/icheckin.service';
import { CheckInResultData, CheckInTicket, CheckInResultEnum } from '../core/checkin';

const CHECKIN_LOCK_TTL = 86400; // 24 horas

@Injectable()
export class CheckInService implements ICheckInService {
  private readonly logger = new Logger(CheckInService.name);

  constructor(
    @Inject(DBRepository) private readonly dbRepository: DBRepository,
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource
  ) {}

  async validateQr(
    qrCode: string,
    eventId: string,
    scannedBy: string,
    deviceInfo?: Record<string, unknown>
  ): Promise<CheckInResultData> {
    // 1. Buscar ticket por qrCode
    const ticket = await this.dbRepository.findOne({
      entity: 'ticket',
      where: { qrCode }
    });

    if (!ticket) {
      this.logger.warn(`Check-in fallido: QR no encontrado (scannedBy=${scannedBy}, eventId=${eventId})`);
      await this.writeLog({ ticketUuid: null, eventUuid: eventId, scannedBy, result: CheckInResult.INVALID, deviceInfo });
      return { success: false, message: 'QR inválido o no registrado', result: CheckInResultEnum.INVALID };
    }

    // 2. Verificar que el ticket corresponde al evento correcto
    if (ticket.eventUuid !== eventId) {
      this.logger.warn(`Check-in fallido: ticket ${ticket.uuid} no pertenece al evento ${eventId}`);
      await this.writeLog({ ticketUuid: ticket.uuid, eventUuid: eventId, scannedBy, result: CheckInResult.WRONG_EVENT, deviceInfo });
      return { success: false, message: 'Esta entrada no corresponde a este evento', result: CheckInResultEnum.WRONG_EVENT };
    }

    // 3. Verificar que el ticket no fue usado ya (check DB)
    if (ticket.status === TicketStatus.USED) {
      this.logger.log(`Check-in fallido: ticket ${ticket.uuid} ya utilizado (DB)`);
      await this.writeLog({ ticketUuid: ticket.uuid, eventUuid: eventId, scannedBy, result: CheckInResult.ALREADY_USED, deviceInfo });
      return { success: false, message: 'Esta entrada ya fue utilizada', result: CheckInResultEnum.ALREADY_USED };
    }

    // 4. Adquirir lock Redis (previene race condition entre dos validadores simultáneos)
    const lockKey = `checkin:${qrCode}`;
    const acquired = await this.redisService.markIdempotency(lockKey, CHECKIN_LOCK_TTL);

    if (!acquired) {
      this.logger.log(`Check-in fallido: ticket ${ticket.uuid} bloqueado por otro proceso (Redis)`);
      await this.writeLog({ ticketUuid: ticket.uuid, eventUuid: eventId, scannedBy, result: CheckInResult.ALREADY_USED, deviceInfo });
      return { success: false, message: 'Esta entrada ya fue utilizada', result: CheckInResultEnum.ALREADY_USED };
    }

    // 5. Actualizar ticket + crear log en transacción
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const now = new Date();

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
