/**
 * Restricción de edad del evento. Códigos fijos (persisten en DB); el label
 * es lo que se muestra en el select del editor y en la ficha pública
 * ("EDAD" en `EventInfoBar`). Debe coincidir con el frontend
 * (`src/lib/events/age-restriction.ts`).
 */
export const EVENT_AGE_RESTRICTIONS = [
  'ALL_AGES',
  'PLUS_16',
  'PLUS_18',
  'PLUS_21',
  'MINORS_WITH_ADULT'
] as const;

export type EventAgeRestriction = (typeof EVENT_AGE_RESTRICTIONS)[number];

export const EVENT_AGE_RESTRICTION_LABELS: Record<EventAgeRestriction, string> = {
  ALL_AGES: 'Todo público',
  PLUS_16: '+16',
  PLUS_18: '+18',
  PLUS_21: '+21',
  MINORS_WITH_ADULT: 'Menores acompañados'
};

export const DEFAULT_EVENT_AGE_RESTRICTION: EventAgeRestriction = 'ALL_AGES';
