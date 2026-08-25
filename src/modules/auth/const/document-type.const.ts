export const DOCUMENT_TYPES = ['DNI', 'Pasaporte', 'Documento extranjero', 'Otro'] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];
