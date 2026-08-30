/**
 * Categorías fijas de la plataforma (FP08 / `29` §18). El Productor elige de
 * esta lista; no puede crear categorías propias, para que el desglose del
 * dashboard sea comparable entre eventos y entre productoras.
 */
export const EXPENSE_CATEGORIES = [
  'seguridad',
  'personal',
  'comida',
  'bebidas',
  'venue',
  'produccion',
  'marketing',
  'transporte',
  'permisos',
  'otro'
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Etiquetas de referencia para Swagger; la UI define las suyas. */
export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  seguridad: 'Seguridad',
  personal: 'Personal/staff',
  comida: 'Comida',
  bebidas: 'Bebidas',
  venue: 'Venue/alquiler',
  produccion: 'Producción/técnica',
  marketing: 'Marketing/promoción',
  transporte: 'Transporte/logística',
  permisos: 'Permisos/habilitaciones',
  otro: 'Otro'
};
