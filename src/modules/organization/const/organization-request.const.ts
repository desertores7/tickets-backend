import type { OrganizationTaxCondition } from './organization-fiscal.const';

export const ORGANIZATION_REQUEST_TYPES = ['bank_change', 'fiscal_change'] as const;
export type OrganizationRequestType = (typeof ORGANIZATION_REQUEST_TYPES)[number];

export const ORGANIZATION_REQUEST_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type OrganizationRequestStatus = (typeof ORGANIZATION_REQUEST_STATUSES)[number];

export type BankChangeRequestPayload = {
  bankName: string;
  cbu: string;
  bankAlias: string;
};

export type FiscalChangeRequestPayload = {
  name: string;
  legalName: string;
  taxId: string;
  taxCondition: OrganizationTaxCondition;
  contactEmail: string;
};

export type OrganizationRequestPayload = BankChangeRequestPayload | FiscalChangeRequestPayload;

export function isBankChangePayload(
  type: OrganizationRequestType,
  payload: OrganizationRequestPayload
): payload is BankChangeRequestPayload {
  return type === 'bank_change';
}

export function isFiscalChangePayload(
  type: OrganizationRequestType,
  payload: OrganizationRequestPayload
): payload is FiscalChangeRequestPayload {
  return type === 'fiscal_change';
}
