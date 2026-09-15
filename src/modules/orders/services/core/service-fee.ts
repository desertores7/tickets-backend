/**
 * Costo de servicio (`BR-PAY-002`): un porcentaje del valor de cada entrada
 * (default 10%), con un tope por entrada. Los dos los define el Administrador.
 *
 * Se calcula entrada por entrada y no sobre el subtotal: una entrada de
 * $1.000.000 pagaría $100.000 de fee, y el tope existe justamente para eso.
 *
 * Toda la aritmética va en centavos enteros. Con flotantes, `100 * 1.1` da
 * `110.00000000000001` y el redondeo hacia arriba le cobra un peso de más.
 */

/** Clave del porcentaje en `system_parameter`, guardado como porcentaje ("10"). */
export const SERVICE_FEE_RATE_PERCENT_PARAM_KEY = 'SERVICE_FEE_RATE_PERCENT';
export const SERVICE_FEE_RATE_PERCENT_DEFAULT = 10;

/** Clave del tope en `system_parameter`. */
export const SERVICE_FEE_CAP_PARAM_KEY = 'SERVICE_FEE_CAP_ARS';
export const SERVICE_FEE_CAP_DEFAULT = 50000;

const toCents = (amount: number): number => Math.round(amount * 100);

/** Tasa en puntos básicos (0.1 → 1000), para operar con enteros. */
const toBps = (rate: number): number => Math.round(rate * 10000);

/**
 * Fee de una entrada a partir de su precio final (ya con descuento).
 *
 * El precio más el fee se redondea al peso hacia arriba y el fee absorbe la
 * diferencia: así ninguna pantalla muestra centavos que después no se cobran.
 * Hacia arriba, porque el redondeo no puede salir del bolsillo de la
 * plataforma. El tope se aplica después: nunca se cobra más que el tope.
 */
export function ticketServiceFee(finalPrice: number, rate: number, cap: number): number {
  const priceCents = toCents(finalPrice);
  if (priceCents <= 0) return 0;

  const withFeeCents =
    Math.ceil((priceCents * (10000 + Math.max(toBps(rate), 0))) / 1_000_000) * 100;
  const feeCents = Math.min(withFeeCents - priceCents, Math.max(toCents(cap), 0));
  return feeCents / 100;
}

/** ¿Al fee de esta entrada lo limitó el tope y no el porcentaje? */
export function isCappedServiceFee(
  finalPrice: number,
  fee: number,
  rate: number,
  cap: number | null
): boolean {
  if (cap === null) return false;
  return toCents(fee) === toCents(cap) && toCents(finalPrice) * toBps(rate) > toCents(cap) * 10000;
}

/**
 * Reparte un importe en partes iguales, en centavos. Los centavos que sobran
 * van a las primeras partes, así la suma cierra exacta.
 */
export function splitEvenly(amount: number, parts: number): number[] {
  if (parts <= 0) return [];
  const totalCents = toCents(amount);
  const base = Math.floor(totalCents / parts);
  const remainder = totalCents - base * parts;
  return Array.from({ length: parts }, (_, i) => (base + (i < remainder ? 1 : 0)) / 100);
}

export interface ServiceFeeLineInput {
  ticketTypeUuid: string;
  quantity: number;
  unitPrice: number;
}

export interface ServiceFeeLineResult {
  /** Parte del descuento del cupón que le toca a esta línea. */
  discountAmount: number;
  serviceFee: number;
}

export interface ServiceFeeAllocation {
  lines: ServiceFeeLineResult[];
  serviceFee: number;
}

/**
 * Fee de una orden, línea por línea.
 *
 * El descuento del cupón se reparte entre las entradas alcanzadas en proporción
 * a su precio (`BR-COUPON-009`), y el fee de cada entrada se calcula sobre su
 * precio ya descontado (`BR-COUPON-008`).
 *
 * @param eligibleTicketTypeUuids tandas alcanzadas por el cupón; `null` = todas.
 */
export function allocateOrderServiceFees(
  lines: ServiceFeeLineInput[],
  discountAmount: number,
  eligibleTicketTypeUuids: string[] | null,
  rate: number,
  cap: number
): ServiceFeeAllocation {
  const units: { line: number; priceCents: number; eligible: boolean }[] = [];
  lines.forEach((line, index) => {
    const eligible = !eligibleTicketTypeUuids || eligibleTicketTypeUuids.includes(line.ticketTypeUuid);
    for (let i = 0; i < line.quantity; i++) {
      units.push({ line: index, priceCents: toCents(line.unitPrice), eligible });
    }
  });

  const discounts = distributeDiscountCents(units, toCents(discountAmount));

  const result: { discountCents: number; feeCents: number }[] = lines.map(() => ({
    discountCents: 0,
    feeCents: 0
  }));

  units.forEach((unit, i) => {
    const finalCents = unit.priceCents - discounts[i];
    result[unit.line].discountCents += discounts[i];
    result[unit.line].feeCents += toCents(ticketServiceFee(finalCents / 100, rate, cap));
  });

  const totalFeeCents = result.reduce((sum, r) => sum + r.feeCents, 0);
  return {
    lines: result.map(r => ({ discountAmount: r.discountCents / 100, serviceFee: r.feeCents / 100 })),
    serviceFee: totalFeeCents / 100
  };
}

/**
 * Descuento por entrada con el método del mayor resto: cada entrada recibe la
 * parte entera de su proporción y los centavos que faltan van a las de mayor
 * resto. BigInt porque precio × descuento en centavos pasa `2^53` con entradas
 * caras.
 */
function distributeDiscountCents(
  units: { priceCents: number; eligible: boolean }[],
  discountCents: number
): number[] {
  const shares = units.map(() => 0);
  const eligibleTotal = units.reduce((sum, u) => sum + (u.eligible ? u.priceCents : 0), 0);
  const toDistribute = Math.min(Math.max(discountCents, 0), eligibleTotal);
  if (toDistribute === 0 || eligibleTotal === 0) return shares;

  const total = BigInt(eligibleTotal);
  const remainders: { index: number; remainder: bigint }[] = [];
  let assigned = 0;

  units.forEach((unit, index) => {
    if (!unit.eligible) return;
    const product = BigInt(toDistribute) * BigInt(unit.priceCents);
    shares[index] = Number(product / total);
    assigned += shares[index];
    remainders.push({ index, remainder: product % total });
  });

  remainders
    .sort((a, b) => (a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1))
    .slice(0, toDistribute - assigned)
    .forEach(({ index }) => {
      shares[index] += 1;
    });

  return shares;
}
