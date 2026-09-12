import { BadRequestException } from '@nestjs/common';
import {
  ORGANIZATION_FISCAL_DOC_MAX_BYTES,
  ORGANIZATION_FISCAL_DOCUMENT_KINDS,
  ORGANIZATION_FISCAL_MIME_TO_EXT,
  type OrganizationFiscalDocumentKind,
  type OrganizationFiscalKnownMime
} from '@modules/organization/const/organization-fiscal.const';

const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  jfif: 'image/jpeg'
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
  if (mime === 'image/gif') {
    const head = buffer.subarray(0, 6).toString('ascii');
    return head === 'GIF87a' || head === 'GIF89a';
  }
  if (mime === 'image/bmp') {
    return buffer[0] === 0x42 && buffer[1] === 0x4d;
  }
  if (mime === 'image/tiff') {
    const le = buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00;
    const be = buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a;
    return le || be;
  }
  if (mime === 'image/heic' || mime === 'image/heif') {
    return buffer.subarray(4, 8).toString('ascii') === 'ftyp';
  }
  return false;
}

/** MIME con firma conocida: exige magic. Otros `image/*`: se aceptan por declaración. */
function hasTrustedMagic(mime: string): boolean {
  return (
    mime === 'application/pdf' ||
    mime === 'image/jpeg' ||
    mime === 'image/png' ||
    mime === 'image/webp' ||
    mime === 'image/gif' ||
    mime === 'image/bmp' ||
    mime === 'image/tiff' ||
    mime === 'image/heic' ||
    mime === 'image/heif'
  );
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
  mimeType: string;
  ext: string;
  originalName: string;
  sizeBytes: number;
  buffer: Buffer;
};

function extFromMime(mime: string, fallbackExt: string): string {
  if (mime in ORGANIZATION_FISCAL_MIME_TO_EXT) {
    return ORGANIZATION_FISCAL_MIME_TO_EXT[mime as OrganizationFiscalKnownMime];
  }
  if (mime.startsWith('image/')) {
    const subtype = mime.slice('image/'.length).split('+')[0]?.replace(/[^a-z0-9]/gi, '') || '';
    if (subtype) return subtype.slice(0, 8).toLowerCase();
  }
  return fallbackExt || 'bin';
}

/** Valida MIME declarado, extensión, tamaño y magic bytes (cuando aplica). */
export function validateFiscalUploadFile(file: Express.Multer.File): ValidatedFiscalUpload {
  if (!file?.buffer?.length) {
    throw new BadRequestException('Archivo requerido');
  }
  if (file.size > ORGANIZATION_FISCAL_DOC_MAX_BYTES) {
    throw new BadRequestException('El archivo supera el máximo de 5 MB');
  }

  const originalName = sanitizeOriginalFileName(file.originalname || 'documento');
  const extRaw = (originalName.split('.').pop() || '').toLowerCase();
  const declaredRaw = (file.mimetype || '').toLowerCase();
  const declared = declaredRaw === 'image/jpg' ? 'image/jpeg' : declaredRaw;
  const mimeFromExt = EXT_TO_MIME[extRaw];

  const isPdf = declared === 'application/pdf' || extRaw === 'pdf' || mimeFromExt === 'application/pdf';
  const isImage =
    declared.startsWith('image/') ||
    (mimeFromExt?.startsWith('image/') ?? false) ||
    (!!extRaw && extRaw !== 'pdf' && Object.prototype.hasOwnProperty.call(EXT_TO_MIME, extRaw) && EXT_TO_MIME[extRaw].startsWith('image/'));

  if (!isPdf && !isImage) {
    throw new BadRequestException('Tipo de archivo no permitido. Usá PDF o una imagen');
  }

  let resolvedMime: string;
  if (isPdf) {
    resolvedMime = 'application/pdf';
  } else if (declared.startsWith('image/')) {
    resolvedMime = declared;
  } else if (mimeFromExt?.startsWith('image/')) {
    resolvedMime = mimeFromExt;
  } else {
    throw new BadRequestException('Tipo de archivo no permitido. Usá PDF o una imagen');
  }

  // Extensión conocida vs MIME: deben coincidir en familia (pdf vs imagen / jpeg vs png).
  if (mimeFromExt) {
    const extIsPdf = mimeFromExt === 'application/pdf';
    const mimeIsPdf = resolvedMime === 'application/pdf';
    if (extIsPdf !== mimeIsPdf) {
      throw new BadRequestException('La extensión no coincide con el tipo de archivo');
    }
    if (!mimeIsPdf && mimeFromExt !== resolvedMime && !(mimeFromExt === 'image/jpeg' && resolvedMime === 'image/jpeg')) {
      // p.ej. .png con image/jpeg
      if (mimeFromExt.startsWith('image/') && resolvedMime.startsWith('image/') && mimeFromExt !== resolvedMime) {
        throw new BadRequestException('La extensión no coincide con el tipo de archivo');
      }
    }
  }

  if (hasTrustedMagic(resolvedMime) && !matchesMagic(file.buffer, resolvedMime)) {
    throw new BadRequestException('El contenido del archivo no es un documento válido');
  }

  return {
    mimeType: resolvedMime,
    ext: extFromMime(resolvedMime, extRaw || (isPdf ? 'pdf' : 'img')),
    originalName,
    sizeBytes: file.size,
    buffer: file.buffer
  };
}
