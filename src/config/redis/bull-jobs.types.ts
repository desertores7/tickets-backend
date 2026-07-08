export const QUEUE_NAMES = {
  TICKETS: 'tickets',
  NOTIFICATIONS: 'notifications',
  PAYMENTS: 'payments',
  ORDERS: 'orders',
  WAITING_ROOM: 'waiting-room'
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface GenerateQrJobData {
  ticketId: string;
  orderId: string;
  userId: string;
  eventId: string;
  ticketTypeId: string;
}

export interface SendTicketEmailJobData {
  userId: string;
  orderId: string;
  email: string;
  eventName: string;
  ticketNumber: string;
  qrUrl: string;
  pdfUrl: string;
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
