export const PRODUCTOR_ROLE_UUID = '8c41b7d9-2f6e-4a35-b8c1-7d92e4f0a516';

export {
  ORGANIZATION_VALIDATION_STATUSES,
  ORGANIZATION_STATUS,
  ORGANIZATION_STATUS_UUID_BY_NAME,
  ORGANIZATION_STATUS_NAME_BY_UUID,
  organizationStatusName,
  type OrganizationValidationStatus
} from './organization-status.const';

export const ORGANIZATION_TAX_CONDITIONS = ['monotributo', 'responsable_inscripto', 'exento'] as const;

export type OrganizationTaxCondition = (typeof ORGANIZATION_TAX_CONDITIONS)[number];

export const ORGANIZATION_FISCAL_DOCUMENT_KINDS = [
  'dni',
  'afip_constancia',
  'cbu_proof',
  'iibb',
  'estatuto',
  'other'
] as const;

export type OrganizationFiscalDocumentKind = (typeof ORGANIZATION_FISCAL_DOCUMENT_KINDS)[number];

/** Kinds usados para auto-asignar tipo al subir (no checklist de envío). */
export const ORGANIZATION_FISCAL_REQUIRED_KINDS = ['dni', 'afip_constancia', 'cbu_proof'] as const;

/** Mínimo obligatorio de constancia de inscripción. */
export const ORGANIZATION_FISCAL_MIN_DOCS = 1;

/** Máximo de archivos de constancia (imagen o PDF). */
export const ORGANIZATION_FISCAL_DOC_MAX_FILES = 2;
export const ORGANIZATION_FISCAL_DOC_MAX_BYTES = 5 * 1024 * 1024;

/** MIME conocidos con magic bytes; además se acepta cualquier `image/*`. */
export const ORGANIZATION_FISCAL_KNOWN_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'image/heic',
  'image/heif'
] as const;

export type OrganizationFiscalKnownMime = (typeof ORGANIZATION_FISCAL_KNOWN_MIME)[number];

/** @deprecated Usar ORGANIZATION_FISCAL_KNOWN_MIME; se mantiene por imports legacy. */
export const ORGANIZATION_FISCAL_ALLOWED_MIME = ORGANIZATION_FISCAL_KNOWN_MIME;

export const ORGANIZATION_FISCAL_MIME_TO_EXT: Record<OrganizationFiscalKnownMime, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/tiff': 'tif',
  'image/heic': 'heic',
  'image/heif': 'heif'
};

/** CBU argentino: exactamente 22 dígitos. */
export function normalizeCbuDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function isValidCbu(raw: string): boolean {
  return /^\d{22}$/.test(normalizeCbuDigits(raw));
}
