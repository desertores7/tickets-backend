/**
 * Tope acumulado por comprador (`ticket_type.maxPerBuyer`): por defecto lo
 * decide el precio de la entrada, no un valor fijo. Una entrada cara facilita
 * la reventa/especulación mucho más rápido que una barata, así que el default
 * es más chico. El Administrador puede ajustar el umbral y los dos límites
 * desde Configuración; un tipo de entrada puede además pisar el default con
 * un valor propio (`ticket_type.maxPerBuyer` explícito, ver `event.service.ts`).
 */

/** Clave del umbral de precio en `system_parameter`, en ARS. */
export const MAX_PER_BUYER_PRICE_THRESHOLD_PARAM_KEY = 'MAX_PER_BUYER_PRICE_THRESHOLD_ARS';
export const MAX_PER_BUYER_PRICE_THRESHOLD_DEFAULT = 1_000_000;

/** Tope por comprador para entradas cuyo precio alcanza el umbral. */
export const MAX_PER_BUYER_HIGH_PRICE_LIMIT_PARAM_KEY = 'MAX_PER_BUYER_HIGH_PRICE_LIMIT';
export const MAX_PER_BUYER_HIGH_PRICE_LIMIT_DEFAULT = 1;

/** Tope por comprador para entradas por debajo del umbral. */
export const MAX_PER_BUYER_LOW_PRICE_LIMIT_PARAM_KEY = 'MAX_PER_BUYER_LOW_PRICE_LIMIT';
export const MAX_PER_BUYER_LOW_PRICE_LIMIT_DEFAULT = 5;

export interface MaxPerBuyerConfig {
  /** Precio a partir del cual aplica `highPriceLimit`, en ARS. */
  priceThreshold: number;
  /** Tope por comprador cuando `unitPrice >= priceThreshold`. */
  highPriceLimit: number;
  /** Tope por comprador cuando `unitPrice < priceThreshold`. */
  lowPriceLimit: number;
}

/**
 * Tope por defecto para una tanda de precio `unitPrice`, según la config
 * vigente. Se calcula al vuelo (no se congela): un ajuste del Administrador
 * aplica de inmediato a las tandas que no tengan un override propio.
 */
export function resolveDefaultMaxPerBuyer(unitPrice: number, config: MaxPerBuyerConfig): number {
  return unitPrice >= config.priceThreshold ? config.highPriceLimit : config.lowPriceLimit;
}
