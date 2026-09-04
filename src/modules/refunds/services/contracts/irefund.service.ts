import { RefundRequestStatus } from '@config/db/entities/tickets/refund_request.entity';

/** Una entrada que el comprador puede incluir en una solicitud. */
export type TRefundableTicket = {
  ticketUuid: string;
  ticketNumber: string;
  ticketTypeName: string;
  /** Valor de la entrada, SIN costo de servicio (`BR-REFUND-006`). */
  amount: number;
  /** Por qué no se puede pedir, si no se puede. Null = disponible. */
  blockedReason: string | null;
};

/** Qué puede pedir el comprador sobre una orden (`BR-REFUND-002`). */
export type TRefundEligibility = {
  orderUuid: string;
  eventUuid: string;
  eventName: string;
  /** Si hubo un cambio material comunicado y la ventana sigue abierta. */
  canRequest: boolean;
  /** Por qué no puede, cuando `canRequest` es false. */
  reason: string | null;
  /** ISO-8601. Hasta cuándo puede pedir. */
  windowEndsAt: Date | null;
  tickets: TRefundableTicket[];
  currency: string;
};

export type TRefundRequestTicket = {
  ticketUuid: string;
  ticketNumber: string;
  amount: number;
};

export type TRefundRequest = {
  uuid: string;
  orderUuid: string;
  orderNumber: string;
  eventUuid: string;
  eventName: string;
  buyerName: string;
  buyerEmail: string;
  status: RefundRequestStatus;
  amount: number;
  currency: string;
  /** Pago de MP sobre el que se ejecuta el reintegro. Uso interno: no va al cliente. */
  mpPaymentId: string;
  /** Motivo del rechazo o del fallo. */
  resolutionReason: string | null;
  /** Número del procesador de MP: con este se le reclama. */
  uniqueSequenceNumber: string | null;
  amountRefundedToPayer: number | null;
  requestedAt: Date;
  resolvedAt: Date | null;
  tickets: TRefundRequestTicket[];
};

export type TRefundFilters = {
  eventUuid?: string;
  status?: RefundRequestStatus;
  /** Fecha de solicitud, YYYY-MM-DD inclusive */
  dateFrom?: string;
  dateTo?: string;
};

/** Resultado de una corrida del cron (`BR-REFUND-011`). */
export type TRefundRunResult = {
  evaluated: number;
  approved: number;
  rejected: number;
  refunded: number;
  processing: number;
  failed: number;
};

export interface IRefundService {
  /**
   * Qué entradas de una orden se pueden pedir y hasta cuándo. Solo el comprador
   * original (`BR-REFUND-001`).
   */
  getEligibility(orderUuid: string, loggedUser: string): Promise<TRefundEligibility>;

  /**
   * Crea la solicitud. Reserva los tickets marcándolos, así dos pedidos
   * simultáneos sobre la misma entrada no pueden pasar los dos.
   */
  createRequest(
    orderUuid: string,
    ticketUuids: string[],
    loggedUser: string
  ): Promise<TRefundRequest>;

  /** Las solicitudes del comprador. */
  listMine(loggedUser: string): Promise<TRefundRequest[]>;

  /** Las del productor, para `29` §7. Solo eventos de su organización. */
  listForProducer(
    filters: TRefundFilters,
    loggedUser: string,
    role: string | null
  ): Promise<TRefundRequest[]>;

  /**
   * Corrida del cron: evalúa las `pending` y consulta las `processing`.
   * **Nunca reintenta** un refund ya enviado (`BR-REFUND-011`).
   */
  processQueue(): Promise<TRefundRunResult>;

  /**
   * Reintento manual de una solicitud en `failed`. Solo Administrador: un
   * reintento sobre un refund que en realidad salió devuelve el dinero dos
   * veces, así que nunca es automático.
   */
  retryFailed(requestUuid: string, loggedUser: string): Promise<TRefundRequest>;
}
