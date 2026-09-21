/**
 * Compra por unidad del mapa (`BR-SALE-010`): qué se reserva y cuántas entradas
 * genera cada línea de la orden, según cómo se vende la tanda.
 *
 * - `general`: sin unidad. Se compra por cantidad, como siempre.
 * - `per_person`: la línea toma `quantity` lugares de UNA unidad, hasta su
 *   capacidad. Genera `quantity` entradas.
 * - `whole_unit`: la línea es UNA unidad completa (quantity = 1). La unidad
 *   admite un solo comprador y genera `admissionsPerUnit` entradas.
 *
 * Pura a propósito: la reserva real (UPDATE condicional) la hace
 * `SectorOccupancyService`; acá solo se decide qué pedirle.
 */

export type SaleModeLike = 'general' | 'per_person' | 'whole_unit';

export type UnitSaleTicketType = {
  uuid: string;
  name: string;
  saleMode?: SaleModeLike | null;
  admissionsPerUnit?: number | null;
  /** Stock de la tanda: respaldo de la capacidad de la unidad. Ver `unitCapacity`. */
  availableQuantity?: number | null;
};

export type UnitSaleSector = {
  uuid: string;
  name: string;
  level?: string | null;
  familyLabel?: string | null;
  capacity?: number | null;
  /** Tandas vinculadas a la unidad en el mapa. */
  ticketTypeUuids: string[];
};

export type UnitSaleLine = {
  /** null en tandas generales: no se reserva nada del mapa. */
  sectorUuid: string | null;
  unitLabel: string | null;
  /** Lugares que la línea toma de la unidad. */
  seats: number;
  /** Tope de lugares de la unidad. */
  seatLimit: number;
  /** Entradas por cada unidad de `quantity`. */
  admissionsPerUnit: number;
};

/**
 * Lugares de la unidad para una tanda por persona.
 *
 * La capacidad del sector (`event_map_sector.capacity`) casi nunca está
 * cargada: el productor escribe "Capacidad / stock" en la tanda, que es el
 * stock de la tanda. Cuando la tanda cuelga de UNA unidad —el caso normal, una
 * tanda por mesa— ese número ES la capacidad de la mesa. Sin este respaldo la
 * mesa quedaba con 0 lugares y no se podía elegir.
 */
export function unitCapacity(
  sector: Pick<UnitSaleSector, 'capacity'>,
  ticketType: Pick<UnitSaleTicketType, 'availableQuantity'>
): number {
  const own = sector.capacity ?? 0;
  if (own > 0) return own;
  return Math.max(0, ticketType.availableQuantity ?? 0);
}

/** "Mesa VIP · Planta alta · 8". Sin categoría queda el nombre solo. */
export function formatUnitLabel(sector: Pick<UnitSaleSector, 'name' | 'level' | 'familyLabel'>): string {
  const parts: string[] = [];
  for (const raw of [sector.familyLabel, sector.level, sector.name]) {
    const part = (raw ?? '').trim();
    // Una unidad sola suele llamarse igual que su categoría ("M3"): repetirlo
    // dejaba "M3 · M3" en la entrada y en el email.
    if (!part) continue;
    const low = part.toLowerCase();
    if (parts.some(prev => prev.toLowerCase() === low)) continue;
    // "Mesas" + "Mesas 8": queda solo "Mesas 8" (no "Mesas · Mesas 8").
    const containedAt = parts.findIndex(prev => low.includes(prev.toLowerCase()));
    if (containedAt >= 0) {
      parts[containedAt] = part;
      continue;
    }
    if (parts.some(prev => prev.toLowerCase().includes(low))) continue;
    parts.push(part);
  }
  return parts.join(' · ');
}

/** "Mesas · Mesas 8" (órdenes viejas) → "Mesas 8". */
export function shortUnitLabel(label: string | null | undefined): string {
  const parts: string[] = [];
  for (const raw of (label ?? '').split('·')) {
    const part = raw.trim();
    if (!part) continue;
    const low = part.toLowerCase();
    if (parts.some(prev => prev.toLowerCase() === low)) continue;
    const containedAt = parts.findIndex(prev => low.includes(prev.toLowerCase()));
    if (containedAt >= 0) {
      parts[containedAt] = part;
      continue;
    }
    if (parts.some(prev => prev.toLowerCase().includes(low))) continue;
    parts.push(part);
  }
  return parts.join(' · ');
}

/**
 * Resuelve una línea de la orden. Devuelve un mensaje para el comprador si la
 * combinación no se puede vender.
 */
export function resolveUnitSaleLine(
  ticketType: UnitSaleTicketType,
  quantity: number,
  sector: UnitSaleSector | null,
  requestedSectorUuid: string | null | undefined
): { line: UnitSaleLine } | { error: string } {
  const saleMode = ticketType.saleMode ?? 'general';

  if (saleMode === 'general') {
    return {
      line: { sectorUuid: null, unitLabel: null, seats: 0, seatLimit: 0, admissionsPerUnit: 1 }
    };
  }

  if (!requestedSectorUuid) {
    return { error: `Elegí la mesa, palco o box para "${ticketType.name}".` };
  }
  if (!sector || !sector.ticketTypeUuids.includes(ticketType.uuid)) {
    return { error: `La unidad elegida no corresponde a "${ticketType.name}".` };
  }

  const unitLabel = formatUnitLabel(sector);

  if (saleMode === 'whole_unit') {
    const admissions = ticketType.admissionsPerUnit ?? 0;
    if (admissions < 1) {
      return { error: `"${ticketType.name}" no tiene configuradas las entradas por unidad.` };
    }
    if (quantity !== 1) {
      return { error: `${unitLabel} se vende completa: una por línea.` };
    }
    return { line: { sectorUuid: sector.uuid, unitLabel, seats: 1, seatLimit: 1, admissionsPerUnit: admissions } };
  }

  // per_person
  const capacity = unitCapacity(sector, ticketType);
  if (capacity < 1) {
    return { error: `${unitLabel} no tiene capacidad configurada.` };
  }
  if (quantity > capacity) {
    return { error: `${unitLabel} tiene ${capacity} lugares.` };
  }
  return {
    line: { sectorUuid: sector.uuid, unitLabel, seats: quantity, seatLimit: capacity, admissionsPerUnit: 1 }
  };
}

/**
 * ¿Se puede elegir esta unidad en el mapa? Misma regla que la reserva: una mesa
 * completa admite un comprador; por persona, hasta su capacidad. Las generales
 * no se eligen por unidad y quedan siempre disponibles.
 *
 * Es solo para pintar el mapa (con caché de segundos): lo que decide es el
 * UPDATE condicional de `SectorOccupancyService.reserve`.
 */
export function isUnitAvailable(
  saleMode: SaleModeLike | null | undefined,
  capacity: number | null | undefined,
  seatsTaken: number,
  /** Stock de la tanda vigente: respaldo cuando la unidad no tiene capacidad. */
  fallbackCapacity?: number | null
): boolean {
  if (saleMode === 'whole_unit') return seatsTaken < 1;
  if (saleMode === 'per_person') {
    const limit = (capacity ?? 0) > 0 ? (capacity ?? 0) : Math.max(0, fallbackCapacity ?? 0);
    return limit > seatsTaken;
  }
  return true;
}

/**
 * Nombre de la entrada con su unidad: "Mesa VIP" + "Mesa VIP · 8" → "Mesa VIP · 8".
 * Si la etiqueta ya empieza con el nombre de la tanda no se repite.
 */
export function ticketDisplayName(ticketTypeName: string, unitLabel: string | null | undefined): string {
  const label = (unitLabel ?? '').trim();
  if (!label) return ticketTypeName;
  return label.toLowerCase().startsWith(ticketTypeName.trim().toLowerCase())
    ? label
    : `${ticketTypeName} · ${label}`;
}
