/**
 * Cómo se vende una tanda (`BR-SALE-010`).
 *
 * - `general`: campo o platea sin numerar. Se compra por cantidad, sin elegir
 *   dónde. Es lo que había antes de este campo.
 * - `per_person`: lugares dentro de una unidad del mapa (mesa, palco…). El
 *   comprador elige la unidad y cuántos lugares; la unidad se llena de a uno.
 * - `whole_unit`: la unidad completa. El comprador elige la mesa 8, la mesa se
 *   bloquea entera y recibe `admissionsPerUnit` entradas. El precio de la tanda
 *   es el de la mesa completa, no por persona.
 *
 * El dato se guarda en la tanda y no se infiere del mapa: el análisis de la IA
 * tiene un `saleMode` por categoría, pero se vincula por nombre de familia y
 * cambia cuando el productor edita el mapa. Adivinar acá es vender dos veces
 * la misma mesa o emitir mal las entradas.
 */
export const TICKET_TYPE_SALE_MODES = ['general', 'per_person', 'whole_unit'] as const;
export type TicketTypeSaleMode = (typeof TICKET_TYPE_SALE_MODES)[number];

export const DEFAULT_TICKET_TYPE_SALE_MODE: TicketTypeSaleMode = 'general';

/** Una mesa de 100 ya es un salón: más que esto es un error de carga. */
export const MAX_ADMISSIONS_PER_UNIT = 100;

export type TicketTypeSaleModeInput = {
  saleMode?: TicketTypeSaleMode | null;
  admissionsPerUnit?: number | null;
};

export type TicketTypeSaleModeValue = {
  saleMode: TicketTypeSaleMode;
  admissionsPerUnit: number | null;
};

/**
 * Combina lo guardado con lo que cambia y valida el resultado.
 *
 * `admissionsPerUnit` solo existe en `whole_unit`: en los otros modos se guarda
 * null aunque venga un número, para que no quede un valor viejo que alguien
 * lea como vigente.
 */
export function resolveTicketTypeSaleMode(
  current: TicketTypeSaleModeValue | null,
  input: TicketTypeSaleModeInput
): { value: TicketTypeSaleModeValue } | { error: string } {
  const saleMode = input.saleMode ?? current?.saleMode ?? DEFAULT_TICKET_TYPE_SALE_MODE;

  if (saleMode !== 'whole_unit') return { value: { saleMode, admissionsPerUnit: null } };

  const admissions =
    input.admissionsPerUnit !== undefined ? input.admissionsPerUnit : (current?.admissionsPerUnit ?? null);
  if (admissions == null) {
    return { error: 'Indicá cuántas entradas incluye cada unidad (mesa, palco o box).' };
  }
  if (!Number.isInteger(admissions) || admissions < 1 || admissions > MAX_ADMISSIONS_PER_UNIT) {
    return { error: `Las entradas por unidad tienen que ser un entero entre 1 y ${MAX_ADMISSIONS_PER_UNIT}.` };
  }
  return { value: { saleMode, admissionsPerUnit: admissions } };
}

/** ¿El cambio altera cómo se vendió lo ya vendido? */
export function saleModeChanged(current: TicketTypeSaleModeValue, next: TicketTypeSaleModeValue): boolean {
  return current.saleMode !== next.saleMode || current.admissionsPerUnit !== next.admissionsPerUnit;
}
