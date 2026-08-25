import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ORGANIZATION_TAX_CONDITIONS,
  ORGANIZATION_VALIDATION_STATUSES,
  organizationStatusName,
  type OrganizationTaxCondition,
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

  @ApiPropertyOptional({ enum: ORGANIZATION_TAX_CONDITIONS, nullable: true })
  taxCondition: OrganizationTaxCondition | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  bankName: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  cbu: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  bankAlias: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  pendingBankName: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  pendingCbu: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  pendingBankAlias: string | null;

  @ApiProperty()
  bankChangePending: boolean;

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
    const row = data as TOrganizationResponseWithUserOrganizations & {
      legalName?: string | null;
      taxId?: string | null;
      taxCondition?: OrganizationTaxCondition | null;
      bankName?: string | null;
      cbu?: string | null;
      bankAlias?: string | null;
      pendingBankName?: string | null;
      pendingCbu?: string | null;
      pendingBankAlias?: string | null;
      bankChangeRequestedAt?: Date | null;
      contactEmail?: string | null;
      contactPhone?: string | null;
      rejectionReason?: string | null;
      validationSubmittedAt?: Date | null;
    };

    this.uuid = data.uuid;
    this.name = data.name;
    this.legalName = row.legalName ?? null;
    this.taxId = row.taxId ?? null;
    this.taxCondition = row.taxCondition ?? null;
    this.bankName = row.bankName ?? null;
    this.cbu = row.cbu ?? null;
    this.bankAlias = row.bankAlias ?? null;
    this.pendingBankName = row.pendingBankName ?? null;
    this.pendingCbu = row.pendingCbu ?? null;
    this.pendingBankAlias = row.pendingBankAlias ?? null;
    this.bankChangePending = Boolean(
      row.pendingBankName || row.pendingCbu || row.pendingBankAlias || row.bankChangeRequestedAt
    );
    this.contactEmail = row.contactEmail ?? null;
    this.contactPhone = row.contactPhone ?? null;
    this.validationStatus = organizationStatusName(data as any);
    this.rejectionReason = row.rejectionReason ?? null;
    this.createdAt = data.createdAt;
    this.validationSubmittedAt = row.validationSubmittedAt ?? null;

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
