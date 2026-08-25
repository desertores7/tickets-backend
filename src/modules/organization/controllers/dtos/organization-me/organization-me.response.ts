import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ORGANIZATION_TAX_CONDITIONS,
  ORGANIZATION_VALIDATION_STATUSES,
  organizationStatusName,
  type OrganizationTaxCondition,
  type OrganizationValidationStatus
} from '@modules/organization/const/organization-fiscal.const';
import { OrganizationEntity } from '@config/db/entities/user/organization.entity';

export class OrganizationMeResponse {
  @ApiProperty()
  uuid: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  active: number;

  @ApiProperty({ enum: ORGANIZATION_VALIDATION_STATUSES })
  validationStatus: OrganizationValidationStatus;

  @ApiPropertyOptional({ type: String, nullable: true })
  legalName: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  taxId: string | null;

  @ApiPropertyOptional({ enum: ORGANIZATION_TAX_CONDITIONS, nullable: true })
  taxCondition: OrganizationTaxCondition | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  contactPhone: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  contactEmail: string | null;

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

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  bankChangeRequestedAt: Date | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  bankChangeRejectionReason: string | null;

  @ApiProperty()
  bankChangePending: boolean;

  @ApiPropertyOptional({ type: String, nullable: true })
  website: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  instagram: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  tiktok: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  facebook: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  socialX: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  rejectionReason: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  validationSubmittedAt: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  validationResolvedAt: Date | null;

  constructor(org: OrganizationEntity) {
    this.uuid = org.uuid;
    this.name = org.name;
    this.active = org.active;
    this.validationStatus = organizationStatusName(org);
    this.legalName = org.legalName ?? null;
    this.taxId = org.taxId ?? null;
    this.taxCondition = org.taxCondition ?? null;
    this.contactPhone = org.contactPhone ?? null;
    this.contactEmail = org.contactEmail ?? null;
    this.bankName = org.bankName ?? null;
    this.cbu = org.cbu ?? null;
    this.bankAlias = org.bankAlias ?? null;
    this.pendingBankName = org.pendingBankName ?? null;
    this.pendingCbu = org.pendingCbu ?? null;
    this.pendingBankAlias = org.pendingBankAlias ?? null;
    this.bankChangeRequestedAt = org.bankChangeRequestedAt ?? null;
    this.bankChangeRejectionReason = org.bankChangeRejectionReason ?? null;
    this.bankChangePending = Boolean(
      org.pendingBankName || org.pendingCbu || org.pendingBankAlias || org.bankChangeRequestedAt
    );
    this.website = org.website ?? null;
    this.instagram = org.instagram ?? null;
    this.tiktok = org.tiktok ?? null;
    this.facebook = org.facebook ?? null;
    this.socialX = org.socialX ?? null;
    this.rejectionReason = org.rejectionReason ?? null;
    this.validationSubmittedAt = org.validationSubmittedAt ?? null;
    this.validationResolvedAt = org.validationResolvedAt ?? null;
  }
}
