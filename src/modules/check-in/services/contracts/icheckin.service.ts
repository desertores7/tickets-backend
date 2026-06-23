import { CheckInResultData } from '../core/checkin';

export interface ICheckInService {
  validateQr(
    qrCode: string,
    eventId: string,
    scannedBy: string,
    deviceInfo?: Record<string, unknown>
  ): Promise<CheckInResultData>;
}
