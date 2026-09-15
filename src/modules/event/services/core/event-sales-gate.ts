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

/**
 * ¿Hay que reabrir la venta tras cambiar la fecha de fin?
 *
 * El job BR-EVENT-013 cierra la venta con `salesClosedAt = endDate` cuando el
 * evento termina. Si la productora después reprograma el fin a futuro, ese
 * cierre quedó viejo y bloqueaba la compra aunque el evento siga vigente.
 *
 * Solo se reabre un cierre automático (coincide con el `endDate` anterior): un
 * cierre manual de admin/productora o una cancelación se respetan.
 */
export function shouldReopenAutoClosedSales(
  event: { cancelledAt?: Date | string | null; salesClosedAt?: Date | string | null; endDate: Date | string },
  newEndDate: Date | string | null | undefined,
  now = new Date()
): boolean {
  if (!newEndDate || event.cancelledAt || !event.salesClosedAt) return false;
  if (new Date(newEndDate) <= now) return false;
  return new Date(event.salesClosedAt).getTime() === new Date(event.endDate).getTime();
}
