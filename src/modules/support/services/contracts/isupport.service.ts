import {
  SupportRequestStatus,
  SupportRequestType
} from '@config/db/entities/system/support_request.entity';
import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { ISearchParams } from '@root/shared/decorators/search-query.decorator';
import { SupportContactType } from '../../controllers/requests/support-contact.request';

export interface ISupportContactData {
  type: SupportContactType;
  message: string;
  email: string;
  userUuid?: string;
}

/** Una consulta como la ve el Administrador (`33` §16). */
export type TSupportRequest = {
  uuid: string;
  type: SupportRequestType;
  message: string;
  email: string;
  status: SupportRequestStatus;
  internalNotes: string | null;
  /** Null cuando escribió sin sesión iniciada. */
  userUuid: string | null;
  /** Nombre de la cuenta, si escribió logueado. */
  userName: string | null;
  userEmail: string | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
};

export type TSupportFilters = {
  status?: SupportRequestStatus;
  type?: SupportRequestType;
};

export type TSupportUpdate = {
  status?: SupportRequestStatus;
  internalNotes?: string;
};

export interface ISupportService {
  contact(data: ISupportContactData): Promise<{ message: string }>;

  listRequests(
    search: ISearchParams,
    filters: TSupportFilters,
    pagination: IPaginationParams
  ): Promise<{ items: TSupportRequest[]; total: number; nuevas: number }>;

  updateRequest(
    requestUuid: string,
    data: TSupportUpdate,
    loggedUser: string
  ): Promise<TSupportRequest>;
}
