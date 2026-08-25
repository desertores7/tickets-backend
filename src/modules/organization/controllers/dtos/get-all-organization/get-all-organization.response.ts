import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ORGANIZATION_VALIDATION_STATUSES,
  type OrganizationValidationStatus
} from '@modules/organization/const/organization-fiscal.const';
import { TOrganizationResponseWithUserOrganizations } from '@modules/organization/services/contracts/iorganization.service';

export class OrganizationListOwnerResponse {
  @ApiProperty()
  uuid: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  email: string | null;

  constructor(data: { uuid: string; firstName: string; lastName: string; email?: string | null }) {
    this.uuid = data.uuid;
    this.firstName = data.firstName;
    this.lastName = data.lastName;
    this.email = data.email ?? null;
  }
}

/** Listado Admin/productor: info reducida para identificar la productora. */
export class GetAllOrganizationResponse {
  @ApiProperty()
  uuid: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  legalName: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  taxId: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  contactEmail: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  contactPhone: string | null;

  @ApiProperty({ enum: ORGANIZATION_VALIDATION_STATUSES })
  validationStatus: OrganizationValidationStatus;

  @ApiPropertyOptional({ type: String, nullable: true })
  rejectionReason: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  validationSubmittedAt: Date | null;

  @ApiPropertyOptional({ type: OrganizationListOwnerResponse, nullable: true })
  owner: OrganizationListOwnerResponse | null;

  constructor(data: TOrganizationResponseWithUserOrganizations) {
    this.uuid = data.uuid;
    this.name = data.name;
    this.legalName = (data as { legalName?: string | null }).legalName ?? null;
    this.taxId = (data as { taxId?: string | null }).taxId ?? null;
    this.contactEmail = (data as { contactEmail?: string | null }).contactEmail ?? null;
    this.contactPhone = (data as { contactPhone?: string | null }).contactPhone ?? null;
    this.validationStatus = (data as { validationStatus: OrganizationValidationStatus }).validationStatus;
    this.rejectionReason = (data as { rejectionReason?: string | null }).rejectionReason ?? null;
    this.createdAt = data.createdAt;
    this.validationSubmittedAt =
      (data as { validationSubmittedAt?: Date | null }).validationSubmittedAt ?? null;

    const firstMembership = data.userOrganizations?.[0];
    const user = firstMembership?.user as
      | { uuid: string; firstName: string; lastName: string; email?: string | null }
      | undefined;
    this.owner = user
      ? new OrganizationListOwnerResponse({
          uuid: user.uuid,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email ?? null
        })
      : null;
  }
}
