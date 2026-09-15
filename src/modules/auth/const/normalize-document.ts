import type { DocumentType } from './document-type.const';

/**
 * Normaliza el número de documento antes de persistir/comparar.
 * DNI: solo dígitos (evita duplicar `39.328.622` vs `39328622`).
 * Otros: trim + mayúsculas.
 */
export function normalizeDocumentNumber(
  documentType: DocumentType | string,
  documentNumber: string
): string {
  const raw = documentNumber.trim();
  if (!raw) return '';
  if (documentType === 'DNI') {
    return raw.replace(/\D/g, '');
  }
  return raw.toUpperCase();
}
