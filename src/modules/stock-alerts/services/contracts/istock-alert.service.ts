export interface IStockAlert {
  uuid: string;
  ticketTypeUuid: string;
  ticketTypeName: string;
  lowThreshold: number | null;
  thresholdIsPercent: boolean;
  notifySoldOut: boolean;
  active: boolean;
  lowNotifiedAt: Date | null;
  soldOutNotifiedAt: Date | null;
  /** Stock restante al momento de la consulta, para mostrar contexto */
  availableQuantity: number;
  totalQuantity: number;
}

export interface IUpsertStockAlertPayload {
  ticketTypeUuid: string;
  lowThreshold?: number | null;
  thresholdIsPercent?: boolean;
  notifySoldOut?: boolean;
  active?: boolean;
}

export interface IStockAlertService {
  listByEvent(eventUuid: string, loggedUser: string): Promise<IStockAlert[]>;

  /** Alta o edición: hay una sola alerta por tanda. */
  upsert(
    eventUuid: string,
    payload: IUpsertStockAlertPayload,
    loggedUser: string
  ): Promise<IStockAlert>;

  remove(eventUuid: string, alertUuid: string, loggedUser: string): Promise<void>;

  /**
   * Crea la alerta por defecto de una tanda si todavía no tiene (sin UI Productor).
   * No pisa una configuración ya existente.
   */
  ensureDefaultForTicketType(eventUuid: string, ticketTypeUuid: string): Promise<void>;

  /**
   * Evalúa las alertas de las tandas afectadas por una compra y notifica si se
   * cruzó un umbral. Se invoca después de confirmar el stock.
   */
  evaluateAfterSale(ticketTypeUuids: string[]): Promise<void>;
}
