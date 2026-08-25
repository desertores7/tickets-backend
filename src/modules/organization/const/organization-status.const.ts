/** Lookup estados de validación de productora (tabla organization_status). */
export const ORGANIZATION_STATUS = {
  DRAFT_INCOMPLETE: {
    uuid: 'a1111111-1111-4111-8111-111111111101',
    name: 'draft_incomplete'
  },
  PENDING_REVIEW: {
    uuid: 'a1111111-1111-4111-8111-111111111102',
    name: 'pending_review'
  },
  APPROVED: {
    uuid: 'a1111111-1111-4111-8111-111111111103',
    name: 'approved'
  },
  REJECTED: {
    uuid: 'a1111111-1111-4111-8111-111111111104',
    name: 'rejected'
  }
} as const;

export const ORGANIZATION_VALIDATION_STATUSES = [
  ORGANIZATION_STATUS.DRAFT_INCOMPLETE.name,
  ORGANIZATION_STATUS.PENDING_REVIEW.name,
  ORGANIZATION_STATUS.APPROVED.name,
  ORGANIZATION_STATUS.REJECTED.name
] as const;

export type OrganizationValidationStatus = (typeof ORGANIZATION_VALIDATION_STATUSES)[number];

export const ORGANIZATION_STATUS_UUID_BY_NAME: Record<OrganizationValidationStatus, string> = {
  draft_incomplete: ORGANIZATION_STATUS.DRAFT_INCOMPLETE.uuid,
  pending_review: ORGANIZATION_STATUS.PENDING_REVIEW.uuid,
  approved: ORGANIZATION_STATUS.APPROVED.uuid,
  rejected: ORGANIZATION_STATUS.REJECTED.uuid
};

export const ORGANIZATION_STATUS_NAME_BY_UUID: Record<string, OrganizationValidationStatus> = {
  [ORGANIZATION_STATUS.DRAFT_INCOMPLETE.uuid]: 'draft_incomplete',
  [ORGANIZATION_STATUS.PENDING_REVIEW.uuid]: 'pending_review',
  [ORGANIZATION_STATUS.APPROVED.uuid]: 'approved',
  [ORGANIZATION_STATUS.REJECTED.uuid]: 'rejected'
};

export function organizationStatusName(
  org: { organizationStatusUuid?: string; organizationStatus?: { name?: string } | null }
): OrganizationValidationStatus {
  if (org.organizationStatus?.name) {
    return org.organizationStatus.name as OrganizationValidationStatus;
  }
  if (org.organizationStatusUuid && ORGANIZATION_STATUS_NAME_BY_UUID[org.organizationStatusUuid]) {
    return ORGANIZATION_STATUS_NAME_BY_UUID[org.organizationStatusUuid];
  }
  return 'draft_incomplete';
}
