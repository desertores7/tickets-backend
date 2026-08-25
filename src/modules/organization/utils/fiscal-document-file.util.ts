import { BadRequestException } from '@nestjs/common';
import {
  ORGANIZATION_FISCAL_ALLOWED_MIME,
  ORGANIZATION_FISCAL_DOC_MAX_BYTES,
  ORGANIZATION_FISCAL_DOCUMENT_KINDS,
  ORGANIZATION_FISCAL_MIME_TO_EXT,
  type OrganizationFiscalDocumentKind
} from '@modules/organization/const/organization-fiscal.const';

const EXT_BY_KIND: Record<string, (typeof ORGANIZATION_FISCAL_ALLOWED_MIME)[number]> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
};

function matchesMagic(buffer: Buffer, mime: string): boolean {
  if (buffer.length < 12) return false;
  if (mime === 'application/pdf') {
    return buffer.subarray(0, 4).toString('ascii') === '%PDF';
  }
  if (mime === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mime === 'image/png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }
  if (mime === 'image/webp') {
    return (
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return false;
}

export function parseFiscalDocumentKind(raw: unknown): OrganizationFiscalDocumentKind {
  if (typeof raw !== 'string' || !ORGANIZATION_FISCAL_DOCUMENT_KINDS.includes(raw as OrganizationFiscalDocumentKind)) {
    throw new BadRequestException(
      `documentKind inválido. Valores: ${ORGANIZATION_FISCAL_DOCUMENT_KINDS.join(', ')}`
    );
  }
  return raw as OrganizationFiscalDocumentKind;
}

/** Vacío / ausente → null (el servicio auto-asigna). Valor inválido → 400. */
export function parseFiscalDocumentKindOptional(raw: unknown): OrganizationFiscalDocumentKind | null {
  if (raw === undefined || raw === null || raw === '') return null;
  return parseFiscalDocumentKind(raw);
}

export function sanitizeOriginalFileName(name: string): string {
  const base = name.replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, ' ').trim();
  return base.slice(0, 200) || 'documento';
}

export type ValidatedFiscalUpload = {
  mimeType: (typeof ORGANIZATION_FISCAL_ALLOWED_MIME)[number];
  ext: string;
  originalName: string;
  sizeBytes: number;
  buffer: Buffer;
};

/** Valida MIME declarado, extensión, tamaño y magic bytes. */
export function validateFiscalUploadFile(file: Express.Multer.File): ValidatedFiscalUpload {
  if (!file?.buffer?.length) {
    throw new BadRequestException('Archivo requerido');
  }
  if (file.size > ORGANIZATION_FISCAL_DOC_MAX_BYTES) {
    throw new BadRequestException('El archivo supera el máximo de 5 MB');
  }

  const originalName = sanitizeOriginalFileName(file.originalname || 'documento');
  const extRaw = (originalName.split('.').pop() || '').toLowerCase();
  const mimeFromExt = EXT_BY_KIND[extRaw];
  if (!mimeFromExt) {
    throw new BadRequestException('Extensión no permitida. Usá PDF, JPG, PNG o WebP');
  }

  const declared = (file.mimetype || '').toLowerCase();
  const normalizedDeclared =
    declared === 'image/jpg' ? 'image/jpeg' : declared;

  if (!(ORGANIZATION_FISCAL_ALLOWED_MIME as readonly string[]).includes(normalizedDeclared)) {
    throw new BadRequestException('Tipo de archivo no permitido. Usá PDF, JPG, PNG o WebP');
  }

  if (normalizedDeclared !== mimeFromExt) {
    throw new BadRequestException('La extensión no coincide con el tipo de archivo');
  }

  if (!matchesMagic(file.buffer, mimeFromExt)) {
    throw new BadRequestException('El contenido del archivo no es un documento válido');
  }

  return {
    mimeType: mimeFromExt,
    ext: ORGANIZATION_FISCAL_MIME_TO_EXT[mimeFromExt],
    originalName,
    sizeBytes: file.size,
    buffer: file.buffer
  };
}
