import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DBRepository } from '@config/db/db.repository';
import { RedisService } from '@config/redis/redis.service';
import { CheckInResult } from '@config/db/entities/tickets/check_in_log.entity';
import { TicketStatus } from '@config/db/entities/tickets/ticket.entity';
import { QrSigningService } from '@modules/qr-generation/services/qr-signing.service';
import {
  ICheckInService,
  IEventCheckInCounter,
  ITicketByDocument,
  IValidatorEvent
} from '../contracts/icheckin.service';
import { CheckInResultData, CheckInTicket, CheckInResultEnum } from '../core/checkin';

const CHECKIN_LOCK_TTL = 86400; // 24 horas
/** El contador vive un poco mas que el evento mas largo razonable. */
const CHECKIN_COUNTER_TTL = 172800; // 48 horas

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
    // alcanza: si el QR se regeneró desde el endpoint de admin, las copias
    // anteriores quedan revocadas.
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

    // El validador solo trabaja los eventos de sus organizaciones. El rol
    // Validador por sí solo no alcanza: sin esto, cualquier validador podría
    // marcar entradas de shows con los que no tiene relación.
    const authorized = await this.isAuthorizedForEvent(scannedBy, event.uuid, event.organizationUuid);
    if (!authorized) {
      this.logger.warn(
        `Check-in rechazado: ${scannedBy} no está habilitado para el evento ${event.uuid} (org ${event.organizationUuid})`
      );
      await this.writeLog({
        ticketUuid: ticket.uuid,
        eventUuid: eventId,
        scannedBy,
        result: CheckInResult.NOT_ASSIGNED,
        deviceInfo
      });
      return {
        success: false,
        message: "No estás habilitado para validar entradas de este evento",
        result: CheckInResultEnum.NOT_ASSIGNED
      };
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

    return this.commitCheckIn(ticket, event, scannedBy, deviceInfo);
  }

  /**
   * Camino comun de confirmacion: lock, transaccion y log.
   *
   * Lo comparten el escaneo de QR y el check-in manual por documento
   * (`BR-QR-002`) para que no puedan divergir: una sola implementacion del
   * lock que evita que dos validadores marquen la misma entrada.
   */
  private async commitCheckIn(
    ticket: { uuid: string; orderItemUuid: string; userUuid: string; eventUuid: string; ticketTypeUuid: string; ticketNumber: string; qrCode: string | null; qrUrl: string | null; pdfUrl: string | null; status: string },
    event: { uuid: string; startDate: Date; endDate: Date },
    scannedBy: string,
    deviceInfo?: Record<string, unknown>
  ): Promise<CheckInResultData> {
    const now = new Date();

    const windowStart = new Date(event.startDate);
    const windowEnd = new Date(event.endDate);
    if (now < windowStart || now > windowEnd) {
      await this.writeLog({ ticketUuid: ticket.uuid, eventUuid: event.uuid, scannedBy, result: CheckInResult.INVALID, deviceInfo });
      return {
        success: false,
        message: 'El check-in de este evento no está abierto',
        result: CheckInResultEnum.INVALID
      };
    }

    if (ticket.status === TicketStatus.USED) {
      await this.writeLog({ ticketUuid: ticket.uuid, eventUuid: event.uuid, scannedBy, result: CheckInResult.ALREADY_USED, deviceInfo });
      return { success: false, message: 'Esta entrada ya fue utilizada', result: CheckInResultEnum.ALREADY_USED };
    }

    // Adquirir lock Redis (previene race condition entre dos validadores simultáneos)
    const lockKey = `checkin:${ticket.uuid}`;
    const acquired = await this.redisService.markIdempotency(lockKey, CHECKIN_LOCK_TTL);

    if (!acquired) {
      this.logger.log(`Check-in fallido: ticket ${ticket.uuid} bloqueado por otro proceso (Redis)`);
      await this.writeLog({ ticketUuid: ticket.uuid, eventUuid: event.uuid, scannedBy, result: CheckInResult.ALREADY_USED, deviceInfo });
      return { success: false, message: 'Esta entrada ya fue utilizada', result: CheckInResultEnum.ALREADY_USED };
    }

    // Actualizar ticket + crear log en transacción
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

      // Contador vivo (`BR-QR-003`). Fuera de la transaccion y sin await que
      // frene la respuesta: si Redis falla, el contador se resiembra desde la
      // base en la proxima consulta y el check-in no se ve afectado.
      this.redisService
        .incrWithExpire(`checkin:count:${event.uuid}`, CHECKIN_COUNTER_TTL)
        .catch(err => this.logger.warn(`No se pudo incrementar el contador: ${err}`));

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

  /**
   * Habilitado = administrador, miembro de la organización dueña del evento, o
   * asignado puntualmente al evento en event_validator.
   *
   * Se acepta la asignación puntual además de la organización para no dejar a
   * nadie en la puerta si lo sacaron de la organización pero sigue asignado al
   * show.
   */
  private async isAuthorizedForEvent(
    userUuid: string,
    eventUuid: string,
    organizationUuid: string
  ): Promise<boolean> {
    const roles = await this.dbRepository.findMany({
      entity: "user_role",
      where: { userUuid, isDeleted: IsNull() } as any,
      relations: { role: true } as any
    });
    if (roles.some((r: any) => r.role?.name === "Administrador")) return true;

    const membership = await this.dbRepository.findOne({
      entity: "user_organization",
      where: { userUuid, organizationUuid, isDeleted: IsNull() } as any
    });
    if (membership) return true;

    const assignment = await this.dbRepository.findOne({
      entity: "event_validator",
      where: { userUuid, eventUuid } as any
    });
    return !!assignment;
  }


  // ── App Validador (29 §20) ──────────────────────────────────────────────────

  /**
   * Eventos del turno del validador.
   *
   * La ventana es `endDate >= ahora` y `startDate <= fin de hoy`: eso cubre el
   * caso overnight sin necesidad de calcular "dia de trabajo" a mano. Un evento
   * de ayer 22:00 a hoy 06:00 sigue apareciendo a las 02:00, porque todavia no
   * termino; y uno que arranca hoy 23:00 aparece desde temprano.
   *
   * Una sola consulta con join y columnas explicitas: es la pantalla que abre
   * el validador al llegar a la puerta y no debe pagar hidratacion de entidades.
   */
  async getMyEventsToday(userUuid: string): Promise<IValidatorEvent[]> {
    const now = new Date();
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const rows = await this.dataSource
      .createQueryBuilder()
      .select('e.uuid', 'uuid')
      .addSelect('e.name', 'name')
      .addSelect('e.startDate', 'startDate')
      .addSelect('e.endDate', 'endDate')
      .addSelect('e.venueName', 'venueName')
      .from('event_validator', 'ev')
      .innerJoin('event', 'e', 'e.uuid = ev.eventUuid')
      .where('ev.userUuid = :userUuid', { userUuid })
      .andWhere('e.isActive = 1')
      .andWhere('e.endDate >= :now', { now })
      .andWhere('e.startDate <= :endOfToday', { endOfToday })
      .orderBy('e.startDate', 'ASC')
      .getRawMany<{
        uuid: string;
        name: string;
        startDate: Date;
        endDate: Date;
        venueName: string | null;
      }>();

    return rows.map(r => {
      const start = new Date(r.startDate);
      const end = new Date(r.endDate);
      return {
        uuid: r.uuid,
        name: r.name,
        startDate: start,
        endDate: end,
        venueName: r.venueName,
        // Misma ventana que aplica `validateQr`, para que la UI no ofrezca
        // escanear algo que el backend va a rechazar.
        checkInOpen: now >= start && now <= end
      };
    });
  }

  /**
   * Busca entradas por documento del titular dentro de un evento.
   *
   * El documento se normaliza a digitos: la gente lo tipea con puntos y el
   * campo se guarda sin formato. Se limita a 20 filas — es una busqueda de
   * puerta, no un listado.
   */
  async findTicketsByDocument(
    eventId: string,
    document: string,
    scannedBy: string
  ): Promise<ITicketByDocument[]> {
    await this.assertCanOperateEvent(eventId, scannedBy);

    const normalized = document.replace(/\D/g, '');
    if (normalized.length < 6) {
      throw new BadRequestException('Ingresá al menos 6 dígitos del documento');
    }

    return this.dataSource
      .createQueryBuilder()
      .select('t.uuid', 'ticketUuid')
      .addSelect('t.ticketNumber', 'ticketNumber')
      .addSelect("CONCAT(u.firstName, ' ', u.lastName)", 'holderName')
      .addSelect('tt.name', 'ticketTypeName')
      .addSelect('t.status', 'status')
      .addSelect('t.checkedInAt', 'checkedInAt')
      .from('ticket', 't')
      .innerJoin('user', 'u', 'u.uuid = t.userUuid')
      .leftJoin('ticket_type', 'tt', 'tt.uuid = t.ticketTypeUuid')
      .where('t.eventUuid = :eventId', { eventId })
      .andWhere('u.dni = :document', { document: normalized })
      .orderBy('t.ticketNumber', 'ASC')
      .limit(20)
      .getRawMany<ITicketByDocument>();
  }

  /**
   * Check-in manual (`BR-QR-002`): la entrada ya se identifico por documento,
   * asi que no hay QR que verificar. El resto del camino es el mismo que el
   * escaneo — misma ventana, mismo lock de Redis, misma transaccion y el mismo
   * log — para que las dos vias no puedan divergir.
   */
  async checkInManually(
    ticketUuid: string,
    eventId: string,
    scannedBy: string,
    deviceInfo?: Record<string, unknown>
  ): Promise<CheckInResultData> {
    await this.assertCanOperateEvent(eventId, scannedBy);

    const ticket = await this.dbRepository.findOne({ entity: 'ticket', where: { uuid: ticketUuid } });

    if (!ticket || ticket.eventUuid !== eventId) {
      await this.writeLog({ ticketUuid: ticket?.uuid ?? null, eventUuid: eventId, scannedBy, result: CheckInResult.WRONG_EVENT, deviceInfo });
      return { success: false, message: 'Esta entrada no corresponde a este evento', result: CheckInResultEnum.WRONG_EVENT };
    }

    const event = await this.dbRepository.findOne({ entity: 'event', where: { uuid: eventId } });
    if (!event) {
      return { success: false, message: 'Evento no encontrado', result: CheckInResultEnum.INVALID };
    }

    return this.commitCheckIn(ticket, event, scannedBy, deviceInfo);
  }

  /**
   * Contador vivo de ingresos del evento (`BR-QR-003`).
   *
   * Se lee de Redis, que se incrementa en cada check-in exitoso: con varios
   * validadores refrescando en la puerta, un COUNT contra la base por cada
   * consulta seria el camino a saturarla. Si la key no existe (primer arranque,
   * expiro, se reinicio Redis) se siembra desde la base una sola vez.
   */
  async getEventCounter(eventId: string, requestedBy: string): Promise<IEventCheckInCounter> {
    await this.assertCanOperateEvent(eventId, requestedBy);

    const key = `checkin:count:${eventId}`;
    let checkedIn = await this.redisService.getCounter(key);

    if (checkedIn === 0) {
      // Puede ser un cero real o una key ausente. Se resuelve contra la base y
      // se siembra, asi el resto de las consultas vuelven a ser O(1).
      const row = await this.dataSource
        .createQueryBuilder()
        .select('COUNT(*)', 'n')
        .from('ticket', 't')
        .where('t.eventUuid = :eventId', { eventId })
        .andWhere('t.status = :status', { status: TicketStatus.USED })
        .getRawOne<{ n: string }>();

      checkedIn = Number(row?.n ?? 0);
      if (checkedIn > 0) {
        await this.redisService.setCounter(key, checkedIn, CHECKIN_COUNTER_TTL);
      }
    }

    const totalRow = await this.dataSource
      .createQueryBuilder()
      .select('COUNT(*)', 'n')
      .from('ticket', 't')
      .where('t.eventUuid = :eventId', { eventId })
      .andWhere('t.status IN (:...statuses)', {
        statuses: [TicketStatus.ACTIVE, TicketStatus.USED]
      })
      .getRawOne<{ n: string }>();

    return { eventUuid: eventId, checkedIn, totalTickets: Number(totalRow?.n ?? 0) };
  }

  /**
   * Autorizacion para operar un evento: Administrador, miembro de la
   * organizacion duenia, o validador asignado a ese evento.
   */
  private async assertCanOperateEvent(eventUuid: string, userUuid: string): Promise<void> {
    const event = await this.dbRepository.findOne({ entity: 'event', where: { uuid: eventUuid } });
    if (!event) throw new NotFoundException('Evento no encontrado');

    const allowed = await this.isAuthorizedForEvent(userUuid, eventUuid, event.organizationUuid);
    if (!allowed) throw new ForbiddenException('No tenés acceso a este evento');
  }

}
