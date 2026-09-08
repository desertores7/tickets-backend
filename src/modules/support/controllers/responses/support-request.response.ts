import { ApiProperty } from '@nestjs/swagger';
import {
  SUPPORT_REQUEST_STATUSES,
  SUPPORT_REQUEST_TYPES,
  SupportRequestStatus,
  SupportRequestType
} from '@config/db/entities/system/support_request.entity';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { TSupportRequest } from '../../services/contracts/isupport.service';

export class SupportRequestResponse {
  @ApiProperty() uuid: string;

  @ApiProperty({ enum: SUPPORT_REQUEST_TYPES })
  type: SupportRequestType;

  @ApiProperty() message: string;

  @ApiProperty({ description: 'A dónde hay que responderle. Puede no ser el email de su cuenta.' })
  email: string;

  @ApiProperty({ enum: SUPPORT_REQUEST_STATUSES })
  status: SupportRequestStatus;

  @ApiProperty({ nullable: true, description: 'Notas del equipo. No las ve quien escribió.' })
  internalNotes: string | null;

  @ApiProperty({ nullable: true, description: 'Null si escribió sin sesión iniciada.' })
  userUuid: string | null;

  @ApiProperty({ nullable: true }) userName: string | null;
  @ApiProperty({ nullable: true }) userEmail: string | null;

  @ApiProperty({ nullable: true, description: 'Quién la cerró' })
  resolvedBy: string | null;

  @ApiProperty({ nullable: true, description: 'ISO-8601' })
  resolvedAt: string | null;

  @ApiProperty({ description: 'ISO-8601' })
  createdAt: string;

  constructor(data: TSupportRequest) {
    this.uuid = data.uuid;
    this.type = data.type;
    this.message = data.message;
    this.email = data.email;
    this.status = data.status;
    this.internalNotes = data.internalNotes;
    this.userUuid = data.userUuid;
    this.userName = data.userName;
    this.userEmail = data.userEmail;
    this.resolvedBy = data.resolvedBy;
    this.resolvedAt = data.resolvedAt ? new Date(data.resolvedAt).toISOString() : null;
    this.createdAt = new Date(data.createdAt).toISOString();
  }
}

export class SupportRequestsResponse {
  @ApiProperty({ type: [SupportRequestResponse] })
  items: SupportRequestResponse[];

  @ApiProperty({ description: 'Sin atender, sobre el total y no sobre la página' })
  nuevas: number;

  @ApiProperty({ type: PaginationMetaResponse })
  meta: PaginationMetaResponse;

  constructor(items: SupportRequestResponse[], nuevas: number, meta: PaginationMetaResponse) {
    this.items = items;
    this.nuevas = nuevas;
    this.meta = meta;
  }
}
