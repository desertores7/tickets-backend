/**
 * Gate de compra post-cierre / cancelación (BR-EVENT-013 / BR-EVENT-010).
 * Devuelve mensaje de error o null si la venta sigue abierta.
 */
export function getEventSalesBlockReason(
  event: {
    cancelledAt?: Date | string | null;
    salesClosedAt?: Date | string | null;
    endDate: Date | string;
    saleStartDate?: Date | string | null;
    saleEndDate?: Date | string | null;
  },
  now: Date = new Date()
): string | null {
  if (event.cancelledAt) {
    return 'El evento fue cancelado y no admite nuevas compras';
  }

  if (event.salesClosedAt && now >= new Date(event.salesClosedAt)) {
    return 'La venta de este evento está cerrada';
  }

  if (event.saleStartDate && now < new Date(event.saleStartDate)) {
    return 'El período de venta aún no ha comenzado';
  }

  const eventEnd = new Date(event.endDate);
  const saleEnd = event.saleEndDate ? new Date(event.saleEndDate) : eventEnd;

  if (now >= eventEnd) {
    return 'El evento ya finalizó';
  }
  if (now > saleEnd) {
    return 'El período de venta ha finalizado';
  }

  return null;
}
