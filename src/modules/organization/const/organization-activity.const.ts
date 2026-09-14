export const ORGANIZATION_ACTIVITY_KINDS = [
  'identity_saved',
  'bank_saved',
  'docs_uploaded',
  'validation_submitted',
  'validation_withdrawn',
  'validation_approved',
  'validation_rejected',
  'bank_change_requested',
  'bank_change_approved',
  'bank_change_rejected',
  'fiscal_change_requested',
  'fiscal_change_approved',
  'fiscal_change_rejected'
] as const;

export type OrganizationActivityKind = (typeof ORGANIZATION_ACTIVITY_KINDS)[number];

export const ORGANIZATION_ACTIVITY_TITLES: Record<OrganizationActivityKind, string> = {
  identity_saved: 'Guardó identidad fiscal',
  bank_saved: 'Guardó datos bancarios',
  docs_uploaded: 'Subió constancia de inscripción',
  validation_submitted: 'Envió solicitud a revisión',
  validation_withdrawn: 'Retiró solicitud de revisión',
  validation_approved: 'Alta aprobada',
  validation_rejected: 'Alta rechazada',
  bank_change_requested: 'Solicitó cambio de cuenta',
  bank_change_approved: 'Cambio de cuenta aprobado',
  bank_change_rejected: 'Cambio de cuenta rechazado',
  fiscal_change_requested: 'Solicitó cambio fiscal',
  fiscal_change_approved: 'Cambio fiscal aprobado',
  fiscal_change_rejected: 'Cambio fiscal rechazado'
};
