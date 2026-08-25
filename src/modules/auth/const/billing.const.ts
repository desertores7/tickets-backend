export const BILLING_ID_TYPES = ['DNI', 'CUIT/CUIL'] as const;
export type BillingIdType = (typeof BILLING_ID_TYPES)[number];

export const BILLING_VAT_CONDITIONS = [
  'Consumidor final',
  'Monotributo',
  'Responsable inscripto',
  'Exento'
] as const;
export type BillingVatCondition = (typeof BILLING_VAT_CONDITIONS)[number];

export const GENDERS = ['Masculino', 'Femenino', 'Otro'] as const;
export type Gender = (typeof GENDERS)[number];
