import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ORGANIZATION_TAX_CONDITIONS,
  ORGANIZATION_VALIDATION_STATUSES,
  organizationStatusName,
  type OrganizationTaxCondition,
  type OrganizationValidationStatus
} from '@modules/organization/const/organization-fiscal.const';
import {
  isBankChangePayload,
  isFiscalChangePayload
} from '@modules/organization/const/organization-request.const';
import { OrganizationEntity } from '@config/db/entities/user/organization.entity';
import { OrganizationRequestEntity } from '@config/db/entities/user/organization_request.entity';

export type OrgRequestView = {
  pendingBank?: OrganizationRequestEntity | null;
  pendingFiscal?: OrganizationRequestEntity | null;
  lastRejectedBank?: OrganizationRequestEntity | null;
  lastRejectedFiscal?: OrganizationRequestEntity | null;
};

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
  pendingName: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  pendingLegalName: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  pendingTaxId: string | null;

  @ApiPropertyOptional({ enum: ORGANIZATION_TAX_CONDITIONS, nullable: true })
  pendingTaxCondition: OrganizationTaxCondition | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  pendingContactEmail: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  fiscalChangeRequestedAt: Date | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  fiscalChangeRejectionReason: string | null;

  @ApiProperty()
  fiscalChangePending: boolean;

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

  constructor(org: OrganizationEntity, requests: OrgRequestView = {}) {
    const pendingBank = requests.pendingBank ?? null;
    const pendingFiscal = requests.pendingFiscal ?? null;
    const bankPayload =
      pendingBank && isBankChangePayload(pendingBank.type, pendingBank.payload)
        ? pendingBank.payload
        : null;
    const fiscalPayload =
      pendingFiscal && isFiscalChangePayload(pendingFiscal.type, pendingFiscal.payload)
        ? pendingFiscal.payload
        : null;

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
    this.pendingBankName = bankPayload?.bankName ?? null;
    this.pendingCbu = bankPayload?.cbu ?? null;
    this.pendingBankAlias = bankPayload?.bankAlias ?? null;
    this.bankChangeRequestedAt = pendingBank?.createdAt ?? null;
    this.bankChangePending = Boolean(pendingBank);
    this.bankChangeRejectionReason = pendingBank
      ? null
      : (requests.lastRejectedBank?.rejectionReason ?? null);
    this.pendingName = fiscalPayload?.name ?? null;
    this.pendingLegalName = fiscalPayload?.legalName ?? null;
    this.pendingTaxId = fiscalPayload?.taxId ?? null;
    this.pendingTaxCondition = fiscalPayload?.taxCondition ?? null;
    this.pendingContactEmail = fiscalPayload?.contactEmail ?? null;
    this.fiscalChangeRequestedAt = pendingFiscal?.createdAt ?? null;
    this.fiscalChangePending = Boolean(pendingFiscal);
    this.fiscalChangeRejectionReason = pendingFiscal
      ? null
      : (requests.lastRejectedFiscal?.rejectionReason ?? null);
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
