import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ORGANIZATION_TAX_CONDITIONS,
  ORGANIZATION_VALIDATION_STATUSES,
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
  verificationReference: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  bankAccount: string | null;

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
    this.validationStatus = org.validationStatus;
    this.legalName = org.legalName ?? null;
    this.taxId = org.taxId ?? null;
    this.taxCondition = org.taxCondition ?? null;
    this.contactPhone = org.contactPhone ?? null;
    this.contactEmail = org.contactEmail ?? null;
    this.verificationReference = org.verificationReference ?? null;
    this.bankAccount = org.bankAccount ?? null;
    this.rejectionReason = org.rejectionReason ?? null;
    this.validationSubmittedAt = org.validationSubmittedAt ?? null;
    this.validationResolvedAt = org.validationResolvedAt ?? null;
  }
}
