export const PROFILE_FILE_TYPE_UUID = 'f1e2d3c4-b5a6-4789-0abc-def123456789';
export const PROFILE_FILE_TYPE_NAME = 'profile';

export function isProfileFile(file: { fileTypeUuid: string }): boolean {
  return file.fileTypeUuid === PROFILE_FILE_TYPE_UUID;
}

/** Tipos de adjunto fiscal de productora (tabla file_type). */
export const ORGANIZATION_FISCAL_FILE_TYPES = {
  dni: {
    uuid: 'b2222222-2222-4222-8222-222222222201',
    name: 'organization_fiscal_dni',
    kind: 'dni' as const
  },
  afip_constancia: {
    uuid: 'b2222222-2222-4222-8222-222222222202',
    name: 'organization_fiscal_afip_constancia',
    kind: 'afip_constancia' as const
  },
  cbu_proof: {
    uuid: 'b2222222-2222-4222-8222-222222222203',
    name: 'organization_fiscal_cbu_proof',
    kind: 'cbu_proof' as const
  },
  iibb: {
    uuid: 'b2222222-2222-4222-8222-222222222204',
    name: 'organization_fiscal_iibb',
    kind: 'iibb' as const
  },
  estatuto: {
    uuid: 'b2222222-2222-4222-8222-222222222205',
    name: 'organization_fiscal_estatuto',
    kind: 'estatuto' as const
  },
  other: {
    uuid: 'b2222222-2222-4222-8222-222222222206',
    name: 'organization_fiscal_other',
    kind: 'other' as const
  }
} as const;

export const ORGANIZATION_FISCAL_FILE_TYPE_UUIDS = Object.values(ORGANIZATION_FISCAL_FILE_TYPES).map(
  t => t.uuid
);

export const ORGANIZATION_FISCAL_KIND_BY_FILE_TYPE_UUID: Record<
  string,
  (typeof ORGANIZATION_FISCAL_FILE_TYPES)[keyof typeof ORGANIZATION_FISCAL_FILE_TYPES]['kind']
> = Object.fromEntries(
  Object.values(ORGANIZATION_FISCAL_FILE_TYPES).map(t => [t.uuid, t.kind])
);

export const ORGANIZATION_FISCAL_FILE_TYPE_UUID_BY_KIND: Record<
  (typeof ORGANIZATION_FISCAL_FILE_TYPES)[keyof typeof ORGANIZATION_FISCAL_FILE_TYPES]['kind'],
  string
> = Object.fromEntries(
  Object.values(ORGANIZATION_FISCAL_FILE_TYPES).map(t => [t.kind, t.uuid])
) as Record<
  (typeof ORGANIZATION_FISCAL_FILE_TYPES)[keyof typeof ORGANIZATION_FISCAL_FILE_TYPES]['kind'],
  string
>;

export function isOrganizationFiscalFileType(fileTypeUuid: string): boolean {
  return (ORGANIZATION_FISCAL_FILE_TYPE_UUIDS as readonly string[]).includes(fileTypeUuid);
}

/** Adjuntos de una liquidación (BR-REPORT-003). Los sube el Administrador. */
export const PAYOUT_FILE_TYPES = {
  transfer_proof: {
    uuid: 'c3333333-3333-4333-8333-333333333301',
    name: 'payout_transfer_proof',
    kind: 'transfer-proof' as const
  },
  arca_invoice: {
    uuid: 'c3333333-3333-4333-8333-333333333302',
    name: 'payout_arca_invoice',
    kind: 'arca-invoice' as const
  }
} as const;

export const PAYOUT_FILE_TYPE_UUID_BY_KIND: Record<'transfer-proof' | 'arca-invoice', string> = {
  'transfer-proof': PAYOUT_FILE_TYPES.transfer_proof.uuid,
  'arca-invoice': PAYOUT_FILE_TYPES.arca_invoice.uuid
};
