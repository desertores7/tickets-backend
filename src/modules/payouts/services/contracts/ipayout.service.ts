import { PayoutStatus } from '@config/db/entities/tickets/payout.entity';
import { ISearchParams } from '@root/shared/decorators/search-query.decorator';
import { IFiltersParams } from '@root/shared/decorators/filter-query.decorator';
import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { payoutFilters } from '../../controllers/const/payout.filters';

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

export interface IPayoutEventOption {
  eventUuid: string;
  eventName: string;
}

export interface IPayoutListResult {
  items: IPayoutEventBlock[];
  /** Eventos con liquidaciones (sin aplicar search/status), para armar el filtro. */
  eventOptions: IPayoutEventOption[];
  /** Presente cuando el listado se pidió paginado (productor / infinite scroll). */
  total?: number;
  page?: number;
  limit?: number;
}

export type TPayoutFilters = IFiltersParams<typeof payoutFilters>;

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
  listMyPayouts(
    loggedUser: string,
    search?: ISearchParams,
    filters?: TPayoutFilters,
    pagination?: IPaginationParams
  ): Promise<IPayoutListResult>;

  getMyPayout(loggedUser: string, payoutUuid: string): Promise<IPayout>;

  getMyPayoutFile(
    loggedUser: string,
    payoutUuid: string,
    kind: PayoutFileKind
  ): Promise<IPayoutFileDownload>;

  // ── Administrador ─────────────────────────────────────────────────────────

  listOrganizationPayouts(
    organizationUuid: string,
    search?: ISearchParams,
    filters?: TPayoutFilters
  ): Promise<IPayoutListResult>;

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
