import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { StaffKind } from '@modules/organization/const/organization-staff.const';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';

export class StaffAssignedEventResponse {
  @ApiProperty()
  uuid: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  isHidden: boolean;

  constructor(data: { uuid: string; name: string; isHidden: boolean }) {
    this.uuid = data.uuid;
    this.name = data.name;
    this.isHidden = data.isHidden;
  }
}

export class StaffMemberResponse {
  @ApiProperty({ enum: ['producer', 'validator', 'cashier', 'producer_invite_pending'] })
  staffKind: StaffKind;

  @ApiPropertyOptional()
  userUuid?: string | null;

  @ApiPropertyOptional()
  inviteUuid?: string | null;

  @ApiProperty()
  email: string;

  @ApiPropertyOptional()
  firstName?: string | null;

  @ApiPropertyOptional()
  lastName?: string | null;

  @ApiPropertyOptional()
  active?: boolean | null;

  @ApiProperty()
  createdAt: string;

  @ApiPropertyOptional({ type: [StaffAssignedEventResponse] })
  assignedEvents?: StaffAssignedEventResponse[];

  @ApiPropertyOptional()
  expiresAt?: string | null;

  constructor(data: {
    staffKind: StaffKind;
    userUuid?: string | null;
    inviteUuid?: string | null;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    active?: boolean | null;
    createdAt: Date | string;
    assignedEvents?: StaffAssignedEventResponse[];
    expiresAt?: Date | string | null;
  }) {
    this.staffKind = data.staffKind;
    this.userUuid = data.userUuid ?? null;
    this.inviteUuid = data.inviteUuid ?? null;
    this.email = data.email;
    this.firstName = data.firstName ?? null;
    this.lastName = data.lastName ?? null;
    this.active = data.active ?? null;
    this.createdAt = new Date(data.createdAt).toISOString();
    this.assignedEvents = data.assignedEvents;
    this.expiresAt = data.expiresAt ? new Date(data.expiresAt).toISOString() : null;
  }
}

export class StaffRoleCountResponse {
  @ApiProperty({ enum: ['producer', 'validator', 'cashier'] })
  role: 'producer' | 'validator' | 'cashier';

  @ApiProperty()
  count: number;

  constructor(data: { role: 'producer' | 'validator' | 'cashier'; count: number }) {
    this.role = data.role;
    this.count = data.count;
  }
}

export class StaffListResponse {
  @ApiProperty({ type: [StaffMemberResponse] })
  items: StaffMemberResponse[];

  @ApiProperty({
    type: [StaffRoleCountResponse],
    description: 'Conteo por rol del equipo completo (sin filtros de listado)'
  })
  byRole: StaffRoleCountResponse[];

  @ApiProperty({ description: 'Total de miembros del equipo (sin filtros de listado)' })
  total: number;

  @ApiProperty({ type: PaginationMetaResponse })
  meta: PaginationMetaResponse;

  constructor(
    items: StaffMemberResponse[],
    byRole: { role: 'producer' | 'validator' | 'cashier'; count: number }[],
    total: number,
    meta: PaginationMetaResponse
  ) {
    this.items = items;
    this.byRole = byRole.map(r => new StaffRoleCountResponse(r));
    this.total = total;
    this.meta = meta;
  }
}
