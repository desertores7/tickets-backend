type DateLike = Date | string | null | undefined;

/**
 * ¿La ventana de venta de una entrada (tanda) es coherente con el evento?
 *
 * La venta se corta cuando termina el evento (`getEventSalesBlockReason`), así
 * que una entrada que dice vender más allá del fin promete algo que no pasa:
 * la productora ve "hasta el 25/11" y la compra se cierra el 22/11. Se rechaza
 * al guardar para que lo configurado y lo real coincidan.
 *
 * Devuelve el motivo, o `null` si está bien. Fechas nulas = hereda la del
 * evento, siempre válido.
 */
export function getTicketTypeSaleWindowError(
  event: { endDate: DateLike },
  window: { saleStartDate?: DateLike; saleEndDate?: DateLike }
): string | null {
  const eventEnd = event.endDate ? new Date(event.endDate) : null;
  const saleStart = window.saleStartDate ? new Date(window.saleStartDate) : null;
  const saleEnd = window.saleEndDate ? new Date(window.saleEndDate) : null;

  if (saleStart && saleEnd && saleEnd <= saleStart) {
    return 'El fin de la venta de la entrada debe ser posterior a su inicio';
  }

  if (!eventEnd) return null;

  if (saleEnd && saleEnd > eventEnd) {
    return 'La venta de la entrada no puede terminar después del fin del evento';
  }

  if (saleStart && saleStart >= eventEnd) {
    return 'La venta de la entrada tiene que empezar antes del fin del evento';
  }

  return null;
}
