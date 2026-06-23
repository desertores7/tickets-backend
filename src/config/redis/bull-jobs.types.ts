export const QUEUE_NAMES = {
  TICKETS: 'tickets',
  NOTIFICATIONS: 'notifications',
  PAYMENTS: 'payments',
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
  ticketId: string;
  orderId: string;
  email: string;
  userName: string;
  eventName: string;
  eventDate: string;
  venueName: string;
  seatInfo: string | null;
  qrCodeUrl: string;
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
