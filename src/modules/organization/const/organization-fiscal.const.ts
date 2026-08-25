export const PRODUCTOR_ROLE_UUID = '8c41b7d9-2f6e-4a35-b8c1-7d92e4f0a516';

export const ORGANIZATION_VALIDATION_STATUSES = [
  'draft_incomplete',
  'pending_review',
  'approved',
  'rejected'
] as const;

export type OrganizationValidationStatus = (typeof ORGANIZATION_VALIDATION_STATUSES)[number];

export const ORGANIZATION_TAX_CONDITIONS = ['monotributo', 'responsable_inscripto', 'exento'] as const;

export type OrganizationTaxCondition = (typeof ORGANIZATION_TAX_CONDITIONS)[number];
