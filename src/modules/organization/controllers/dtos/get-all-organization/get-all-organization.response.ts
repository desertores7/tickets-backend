import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ORGANIZATION_FISCAL_MIN_DOCS,
  ORGANIZATION_TAX_CONDITIONS,
  ORGANIZATION_VALIDATION_STATUSES,
  isValidCbu,
  organizationStatusName,
  type OrganizationTaxCondition,
  type OrganizationValidationStatus
} from '@modules/organization/const/organization-fiscal.const';
import {
  isBankChangePayload,
  isFiscalChangePayload
} from '@modules/organization/const/organization-request.const';
import { TOrganizationResponseWithUserOrganizations } from '@modules/organization/services/contracts/iorganization.service';
import type { OrgRequestView } from '../organization-me/organization-me.response';

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
  pendingName: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  pendingLegalName: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  pendingTaxId: string | null;

  @ApiPropertyOptional({ enum: ORGANIZATION_TAX_CONDITIONS, nullable: true })
  pendingTaxCondition: OrganizationTaxCondition | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  pendingContactEmail: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  pendingContactPhone: string | null;

  @ApiProperty()
  fiscalChangePending: boolean;

  @ApiPropertyOptional({ type: String, nullable: true })
  contactEmail: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  contactPhone: string | null;

  @ApiProperty({ enum: ORGANIZATION_VALIDATION_STATUSES })
  validationStatus: OrganizationValidationStatus;

  @ApiProperty({ description: 'En 0 la productora está suspendida (`BR-PROD-006`).' })
  active: number;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  suspendedAt: Date | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Motivo interno de la suspensión. Nunca se le muestra al público.'
  })
  suspensionReason: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  rejectionReason: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  validationSubmittedAt: Date | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Fecha en que Admin aprobó o rechazó la validación fiscal.'
  })
  validationResolvedAt: Date | null;

  @ApiPropertyOptional({ type: OrganizationListOwnerResponse, nullable: true })
  owner: OrganizationListOwnerResponse | null;

  @ApiProperty({ description: 'Identidad fiscal completa (nombre, CUIT, contacto, etc.).' })
  identityComplete: boolean;

  @ApiProperty({ description: 'Datos bancarios completos (banco, CBU válido, alias).' })
  bankComplete: boolean;

  @ApiProperty({ description: 'Cantidad de archivos de constancia activos.' })
  docsCount: number;

  @ApiProperty({ description: 'Constancia de inscripción con el mínimo requerido.' })
  docsComplete: boolean;

  constructor(
    data: TOrganizationResponseWithUserOrganizations,
    requests: OrgRequestView = {},
    docsCount = 0
  ) {
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

    this.uuid = data.uuid;
    this.name = data.name;
    this.legalName = data.legalName ?? null;
    this.taxId = data.taxId ?? null;
    this.taxCondition = data.taxCondition ?? null;
    this.bankName = data.bankName ?? null;
    this.cbu = data.cbu ?? null;
    this.bankAlias = data.bankAlias ?? null;
    this.pendingBankName = bankPayload?.bankName ?? null;
    this.pendingCbu = bankPayload?.cbu ?? null;
    this.pendingBankAlias = bankPayload?.bankAlias ?? null;
    this.bankChangePending = Boolean(pendingBank);
    this.pendingName = fiscalPayload?.name ?? null;
    this.pendingLegalName = fiscalPayload?.legalName ?? null;
    this.pendingTaxId = fiscalPayload?.taxId ?? null;
    this.pendingTaxCondition = fiscalPayload?.taxCondition ?? null;
    this.pendingContactEmail = fiscalPayload?.contactEmail ?? null;
    this.pendingContactPhone = fiscalPayload?.contactPhone ?? null;
    this.fiscalChangePending = Boolean(pendingFiscal);
    this.contactEmail = data.contactEmail ?? null;
    this.contactPhone = data.contactPhone ?? null;
    this.validationStatus = organizationStatusName(data as any);
    this.active = data.active;
    this.suspendedAt = data.suspendedAt ?? null;
    this.suspensionReason = data.suspensionReason ?? null;
    this.rejectionReason = data.rejectionReason ?? null;
    this.createdAt = data.createdAt;
    this.validationSubmittedAt = data.validationSubmittedAt ?? null;
    this.validationResolvedAt = data.validationResolvedAt ?? null;

    this.identityComplete = Boolean(
      data.name?.trim() &&
        data.legalName?.trim() &&
        data.taxId?.trim() &&
        data.taxCondition &&
        data.contactEmail?.trim() &&
        data.contactPhone?.trim()
    );
    this.bankComplete = Boolean(
      data.bankName?.trim() && isValidCbu(data.cbu ?? '') && data.bankAlias?.trim()
    );
    this.docsCount = docsCount;
    this.docsComplete = docsCount >= ORGANIZATION_FISCAL_MIN_DOCS;

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
