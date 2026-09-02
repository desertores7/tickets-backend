import { PayoutStatus } from '@config/db/entities/tickets/payout.entity';

export interface IPayout {
  uuid: string;
  eventUuid: string;
  eventName: string;
  /** Sin costo de servicio (`BR-REPORT-001`) */
  amount: number;
  transferredAt: Date;
  notes: string | null;
  status: PayoutStatus;
  hasTransferProof: boolean;
  hasArcaInvoice: boolean;
  createdAt: Date;
}

/** La UI agrupa por evento (`29` §8): un bloque por evento con sus liquidaciones. */
export interface IPayoutEventBlock {
  eventUuid: string;
  eventName: string;
  eventStartDate: Date | null;
  totalAmount: number;
  payouts: IPayout[];
}

export interface ICreatePayoutPayload {
  eventUuid: string;
  amount: number;
  /** ISO-8601 */
  transferredAt: string;
  notes?: string | null;
}

export type PayoutFileKind = 'transfer-proof' | 'arca-invoice';

export interface IPayoutFileDownload {
  absolutePath: string;
  mimeType: string;
  originalName: string;
}

export interface IPayoutService {
  /** Liquidaciones de la productora del usuario, agrupadas por evento. */
  listMyPayouts(loggedUser: string): Promise<IPayoutEventBlock[]>;

  getMyPayout(loggedUser: string, payoutUuid: string): Promise<IPayout>;

  getMyPayoutFile(
    loggedUser: string,
    payoutUuid: string,
    kind: PayoutFileKind
  ): Promise<IPayoutFileDownload>;

  // ── Administrador ─────────────────────────────────────────────────────────

  listOrganizationPayouts(organizationUuid: string): Promise<IPayoutEventBlock[]>;

  createPayout(
    organizationUuid: string,
    payload: ICreatePayoutPayload,
    createdBy: string
  ): Promise<IPayout>;

  uploadPayoutFile(
    payoutUuid: string,
    kind: PayoutFileKind,
    file: Express.Multer.File
  ): Promise<IPayout>;

  deletePayout(payoutUuid: string): Promise<void>;
}
