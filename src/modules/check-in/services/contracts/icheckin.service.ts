import { CheckInResultData } from '../core/checkin';

/** Evento del día de trabajo del validador (`29` §20). */
export interface IValidatorEvent {
  uuid: string;
  name: string;
  startDate: Date;
  endDate: Date;
  venueName: string | null;
  /** true si la ventana de check-in está abierta ahora mismo */
  checkInOpen: boolean;
}

/** Entrada encontrada por documento, para el check-in manual (`BR-QR-002`). */
export interface ITicketByDocument {
  ticketUuid: string;
  ticketNumber: string;
  holderName: string;
  ticketTypeName: string;
  status: string;
  checkedInAt: Date | null;
}

export interface IEventCheckInCounter {
  eventUuid: string;
  /** Ingresos de TODOS los validadores del evento (`BR-QR-003`) */
  checkedIn: number;
  totalTickets: number;
}

export interface ICheckInService {
  validateQr(
    qrCode: string,
    eventId: string,
    scannedBy: string,
    deviceInfo?: Record<string, unknown>
  ): Promise<CheckInResultData>;

  /**
   * Eventos del día de trabajo del validador. Incluye overnight: un evento que
   * empezó ayer 22:00 y termina hoy 06:00 sigue siendo el turno de hoy.
   */
  getMyEventsToday(userUuid: string): Promise<IValidatorEvent[]>;

  /** Busca entradas por número de documento dentro de un evento (`BR-QR-002`). */
  findTicketsByDocument(
    eventId: string,
    document: string,
    scannedBy: string
  ): Promise<ITicketByDocument[]>;

  /** Check-in manual de una entrada ya identificada por documento (`BR-QR-002`). */
  checkInManually(
    ticketUuid: string,
    eventId: string,
    scannedBy: string,
    deviceInfo?: Record<string, unknown>
  ): Promise<CheckInResultData>;

  /** Contador vivo agregado entre todos los puntos de acceso (`BR-QR-003`). */
  getEventCounter(eventId: string, requestedBy: string): Promise<IEventCheckInCounter>;
}
