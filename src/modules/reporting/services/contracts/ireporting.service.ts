import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';

/** Filtros de la vista Ventas (`29` §7) */
export interface ISalesFilters {
  /** Nombre o email del comprador, o número de orden */
  search?: string;
  eventUuid?: string;
  /** Solo Administrador: acota a los eventos de una productora. */
  organizationUuid?: string;
  ticketTypeUuid?: string;
  /** Fecha de compra, YYYY-MM-DD inclusive */
  dateFrom?: string;
  dateTo?: string;
  status?: string;
}

/**
 * Una fila = una compra de N entradas de un mismo tipo (order_item).
 *
 * `amount` es SOLO el valor de las entradas: nunca incluye el costo de
 * servicio (`BR-REPORT-001`).
 */
export interface ISalesRow {
  orderUuid: string;
  orderNumber: string;
  buyerName: string;
  buyerEmail: string;
  eventUuid: string;
  eventName: string;
  ticketTypeName: string;
  quantity: number;
  amount: number;
  currency: string;
  purchasedAt: Date;
  status: string;
  /** Entradas de este renglón ya reembolsadas. 0 = ninguna. */
  refundedQuantity: number;
}

/** Renglon del detalle de una venta: una tanda comprada. */
export interface ISaleDetailItem {
  ticketTypeUuid: string;
  ticketTypeName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  /** Entradas de esta tanda ya reembolsadas. */
  refundedQuantity: number;
}

/** Una entrada concreta de la orden. */
export interface ISaleTicket {
  uuid: string;
  ticketNumber: string;
  ticketTypeName: string;
  status: string;
  qrUrl: string | null;
  pdfUrl: string | null;
  /**
   * El PDF existe **en el disco**, no solo en la base.
   *
   * La fila puede figurar generada y el archivo no estar: ahí la descarga
   * devuelve 404 y la entrada hay que regenerarla. Mirar `pdfUrl` no alcanza
   * para detectarlo, que es justo el caso que interesa al operar.
   */
  pdfDisponible: boolean;
  /** Reembolso activo sobre esta entrada, si lo hay. */
  refundStatus: string | null;
}

/**
 * Detalle completo de una orden para la vista Ventas del productor.
 *
 * Igual que el listado, `ticketsAmount` es solo el valor de las entradas.
 * `serviceFee` y `total` viajan unicamente para el Administrador
 * (`BR-REPORT-001`).
 */
export interface ISaleDetail {
  orderUuid: string;
  orderNumber: string;
  status: string;
  currency: string;
  purchasedAt: Date;
  paidAt: Date | null;
  paymentProvider: string | null;
  paymentMethod: string | null;
  paymentId: string | null;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string | null;
  buyerDocument: string | null;
  eventUuid: string;
  eventName: string;
  eventStartDate: Date | null;
  eventVenueName: string | null;
  eventVenueCity: string | null;
  items: ISaleDetailItem[];
  /** Las entradas una por una, para operar sobre cada una (regenerar QR/PDF). */
  tickets: ISaleTicket[];
  ticketsCount: number;
  /** Entradas de la orden ya reembolsadas. */
  ticketsRefunded: number;
  ticketsAmount: number;
  serviceFee?: number;
  total?: number;
}

export interface IDashboardFilters {
  dateFrom?: string;
  dateTo?: string;
}

/** Fila de "eventos con mas ventas" del dashboard del productor. */
export interface IDashboardTopEvent {
  uuid: string;
  name: string;
  totalTicketsSold: number;
  /** Sin costo de servicio, igual que webRevenue (BR-REPORT-001) */
  ticketRevenue: number;
  lastOrderPaidAt: Date | null;
}

/**
 * Metricas exclusivas del Administrador. El costo de servicio SI aparece aca:
 * BR-REPORT-001 solo lo prohibe en las respuestas del Productor.
 */
export interface IAdminDashboardSummary {
  organizationsPendingReview: number;
  organizationsBankChangePending: number;
  organizationsApproved: number;
  serviceFeeRevenue: number;
  /** Entradas + costo de servicio */
  grossRevenue: number;
}

export interface IDashboardSummary {
  eventsCount: number;
  /** Publicados y borradores por separado: el dashboard los muestra desglosados */
  eventsPublished: number;
  eventsDraft: number;
  ticketsSold: number;
  /** Recaudación de entradas web, sin costo de servicio */
  webRevenue: number;
  /** Ingresos operativos de caja (`BR-CASH-007`) */
  cashRevenue: number;
  totalIncome: number;
  expensesTotal: number;
  /** Total ingresos − gastos */
  estimatedResult: number;
  expensesByCategory: { category: string; total: number }[];
  topEvents: IDashboardTopEvent[];
  currency: string;
  /**
   * Los ingresos de caja son reales. Queda como bandera del contrato: el
   * frontend la usa para decidir si muestra los KPIs de caja.
   */
  cashModuleAvailable: boolean;
  /** Solo se completa para el Administrador */
  admin?: IAdminDashboardSummary;
}

/**
 * Dashboard de un evento (`29` §17).
 *
 * Son los KPIs de `29` §6 acotados al evento: solo agregados, sin detalle de
 * productos por ingreso ni líneas de gasto. La recaudación web nunca incluye
 * el costo de servicio (`BR-REPORT-001`).
 */
export interface IEventDashboard {
  eventUuid: string;
  eventName: string;
  startDate: Date;
  endDate: Date;
  isPublished: boolean;

  /** Entradas web vendidas, en unidades */
  ticketsSold: number;
  /** Recaudación de entradas web, sin costo de servicio */
  webRevenue: number;

  /** Σ productos tipo `entrada` de la caja (`BR-CASH-006`) */
  doorTickets: number;
  mpIncome: number;
  transfersAndOthers: number;
  manualIncome: number;
  /** Devoluciones y contracargos: restan */
  mpRefunds: number;
  /** Ingresos operativos netos de la caja (`BR-CASH-007`) */
  cashRevenue: number;

  /** webRevenue + cashRevenue */
  totalIncome: number;
  expensesTotal: number;
  /** Agregado por categoría, sin líneas ni proveedores (`29` §17) */
  expensesByCategory: { category: string; total: number }[];
  /** totalIncome − expensesTotal */
  estimatedResult: number;
  currency: string;
}

export interface IReportingService {
  getSales(
    loggedUser: string,
    role: string | null,
    filters: ISalesFilters,
    pagination: IPaginationParams
  ): Promise<{ meta: PaginationMetaResponse; items: ISalesRow[] }>;

  /** Todas las filas que matcheen, sin paginar — para armar el archivo de export */
  /** Detalle de una venta puntual, con el mismo scope que el listado. */
  getSaleDetail(loggedUser: string, role: string | null, orderUuid: string): Promise<ISaleDetail>;

  getAllSalesForExport(
    loggedUser: string,
    role: string | null,
    filters: ISalesFilters
  ): Promise<ISalesRow[]>;

  /** Dashboard de un evento (`29` §17). Solo el dueño del evento o el Administrador. */
  getEventDashboard(
    eventUuid: string,
    loggedUser: string,
    role: string | null
  ): Promise<IEventDashboard>;

  getDashboard(
    loggedUser: string,
    role: string | null,
    filters: IDashboardFilters
  ): Promise<IDashboardSummary>;
}
