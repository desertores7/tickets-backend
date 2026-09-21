export type TicketSalesStatus = 'disabled' | 'upcoming' | 'available' | 'sold_out' | 'expired';

export type TicketSalesCandidate = {
  uuid: string;
  isActive: boolean;
  salesEnabled: boolean;
  availableQuantity: number;
  saleStartDate: Date | string | null;
  saleEndDate: Date | string | null;
  sortOrder: number;
};

function validTime(value: Date | string | null): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

export function getTicketSalesStatus(ticket: TicketSalesCandidate, now: Date = new Date()): TicketSalesStatus {
  if (!ticket.isActive || !ticket.salesEnabled) return 'disabled';

  const nowTime = now.getTime();
  const startTime = validTime(ticket.saleStartDate);
  const endTime = validTime(ticket.saleEndDate);

  if (startTime !== null && nowTime < startTime) return 'upcoming';
  if (endTime !== null && nowTime >= endTime) return 'expired';
  if (ticket.availableQuantity <= 0) return 'sold_out';
  return 'available';
}

/**
 * Una sola tanda vigente por grupo/sector. La ventana que empezó más
 * recientemente reemplaza a la anterior; sortOrder estabiliza empates.
 */
export function selectCurrentTicketType<T extends TicketSalesCandidate>(
  tickets: T[],
  now: Date = new Date()
): T | null {
  const available = tickets.filter(ticket => getTicketSalesStatus(ticket, now) === 'available');
  available.sort((a, b) => {
    const startA = validTime(a.saleStartDate) ?? Number.NEGATIVE_INFINITY;
    const startB = validTime(b.saleStartDate) ?? Number.NEGATIVE_INFINITY;
    return startB - startA || a.sortOrder - b.sortOrder || a.uuid.localeCompare(b.uuid);
  });
  return available[0] ?? null;
}

export function selectNextUpcomingTicketType<T extends TicketSalesCandidate>(
  tickets: T[],
  now: Date = new Date()
): T | null {
  const upcoming = tickets.filter(ticket => getTicketSalesStatus(ticket, now) === 'upcoming');
  upcoming.sort((a, b) => {
    const startA = validTime(a.saleStartDate) ?? Number.POSITIVE_INFINITY;
    const startB = validTime(b.saleStartDate) ?? Number.POSITIVE_INFINITY;
    return startA - startB || a.sortOrder - b.sortOrder || a.uuid.localeCompare(b.uuid);
  });
  return upcoming[0] ?? null;
}

export type TierCandidate = TicketSalesCandidate & {
  name: string;
  saleMode?: string | null;
};

/**
 * Una tanda por bloque nace como N entradas ("Preventa 1..20"), una por unidad
 * del mapa. Para la venta son UNA sola tanda: la clave es el nombre sin el
 * número. Las entradas sueltas (generales) son su propia tanda.
 */
export function ticketTierKey(ticket: Pick<TierCandidate, 'uuid' | 'name' | 'saleMode'>): string {
  if (ticket.saleMode === 'whole_unit' || ticket.saleMode === 'per_person') {
    const name = ticket.name.trim();
    const base = name.replace(/\s*\d+\s*$/, '').trim();
    if (base && base !== name) return `tier:${base.toLowerCase()}`;
  }
  return `single:${ticket.uuid}`;
}

function tierStatus(members: TierCandidate[], now: Date): TicketSalesStatus {
  const statuses = members.map(member => getTicketSalesStatus(member, now));
  if (statuses.includes('available')) return 'available';
  if (statuses.includes('upcoming')) return 'upcoming';
  if (statuses.includes('sold_out')) return 'sold_out';
  return statuses[0] ?? 'disabled';
}

/**
 * Tanda vigente de UN sector (nunca hay dos a la vez).
 *
 * - La tanda se elige entre las de ese sector; una tanda por bloque está
 *   "vigente" mientras le quede alguna unidad, no cuando se vende la de este
 *   sector. La siguiente arranca recién cuando se agotó toda la anterior.
 * - Una tanda con fecha de inicio ya cumplida reemplaza a la anterior.
 * - Devuelve la entrada de ESTE sector dentro de esa tanda, aunque esa unidad
 *   ya esté vendida (así no se vuelve a ofrecer en la tanda siguiente).
 */
export function selectCurrentTicketTypeForSector<T extends TierCandidate>(
  sectorTickets: T[],
  allTickets: T[],
  now: Date = new Date()
): T | null {
  const membersByTier = new Map<string, T[]>();
  for (const ticket of allTickets) {
    const key = ticketTierKey(ticket);
    const arr = membersByTier.get(key) ?? [];
    arr.push(ticket);
    membersByTier.set(key, arr);
  }

  const tiers = new Map<string, T[]>();
  for (const ticket of sectorTickets) {
    const key = ticketTierKey(ticket);
    const arr = tiers.get(key) ?? [];
    arr.push(ticket);
    tiers.set(key, arr);
  }

  const candidates = [...tiers.entries()]
    .map(([key, own]) => {
      const members = membersByTier.get(key) ?? own;
      return { key, own, members, status: tierStatus(members, now) };
    })
    .filter(tier => tier.status === 'available');

  const tierStart = (members: T[]) =>
    Math.max(...members.map(member => validTime(member.saleStartDate) ?? Number.NEGATIVE_INFINITY));
  const tierOrder = (members: T[]) => Math.min(...members.map(member => member.sortOrder));

  candidates.sort(
    (a, b) =>
      tierStart(b.members) - tierStart(a.members) ||
      tierOrder(a.members) - tierOrder(b.members) ||
      a.key.localeCompare(b.key)
  );
  const current = candidates[0];
  if (!current) return null;
  return [...current.own].sort((a, b) => a.sortOrder - b.sortOrder || a.uuid.localeCompare(b.uuid))[0] ?? null;
}
