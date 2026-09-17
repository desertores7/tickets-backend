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
