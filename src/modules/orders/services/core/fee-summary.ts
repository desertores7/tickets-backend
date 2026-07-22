export interface EventFeeSummary {
  uuid: string;
  eventUuid: string;
  totalOrdersPaid: number;
  totalTicketsSold: number;
  grossAmount: number;
  ticketAmount: number;
  serviceFeeAmount: number;
  currency: string;
  lastOrderPaidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
