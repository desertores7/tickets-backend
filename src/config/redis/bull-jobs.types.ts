export const QUEUE_NAMES = {
  TICKETS: 'tickets',
  NOTIFICATIONS: 'notifications',
  PAYMENTS: 'payments',
  ORDERS: 'orders',
  WAITING_ROOM: 'waiting-room',
  MAINTENANCE: 'maintenance'
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface GenerateQrJobData {
  ticketId: string;
  orderId: string;
  userId: string;
  eventId: string;
  ticketTypeId: string;
}

export interface SendOrderTicketsEmailJobData {
  /** Un solo email por orden con todos los tickets adjuntos — el processor carga el resto desde la DB */
  orderId: string;
}

export interface ProcessWebhookJobData {
  provider: string;
  event: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  receivedAt: string;
}

export interface ReleaseExpiredStockJobData {
  reservationId: string;
  ticketTypeId: string;
  quantity: number;
  expiredAt: string;
}

export interface ProcessWaitingRoomJobData {
  eventId: string;
  batchSize: number;
  admissionTtlSeconds: number;
}

export interface CleanupExpiredAssetsJobData {
  /** Días de gracia después de event.endDate antes de borrar los archivos QR/PDF */
  graceDays: number;
}
