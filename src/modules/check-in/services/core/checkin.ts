export { CheckInResult as CheckInResultEnum } from '@config/db/entities/tickets/check_in_log.entity';

export interface CheckInTicket {
  uuid: string;
  ticketNumber: string;
  eventUuid: string;
  userUuid: string;
  status: string;
  checkedInAt: Date | null;
  checkedInBy: string | null;
}

export interface CheckInResultData {
  success: boolean;
  ticket?: CheckInTicket;
  message: string;
  result: string;
}
