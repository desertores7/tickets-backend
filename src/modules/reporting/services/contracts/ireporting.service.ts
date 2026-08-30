import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';

/** Filtros de la vista Ventas (`29` §7) */
export interface ISalesFilters {
  /** Nombre o email del comprador, o número de orden */
  search?: string;
  eventUuid?: string;
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
  /** Ingresos operativos de caja. 0 hasta que exista el módulo FP11. */
  cashRevenue: number;
  totalIncome: number;
  expensesTotal: number;
  /** Total ingresos − gastos */
  estimatedResult: number;
  expensesByCategory: { category: string; total: number }[];
  topEvents: IDashboardTopEvent[];
  currency: string;
  /** Avisa al frontend que el número de caja todavía no es real */
  cashModuleAvailable: boolean;
  /** Solo se completa para el Administrador */
  admin?: IAdminDashboardSummary;
}

export interface IReportingService {
  getSales(
    loggedUser: string,
    role: string | null,
    filters: ISalesFilters,
    pagination: IPaginationParams
  ): Promise<{ meta: PaginationMetaResponse; items: ISalesRow[] }>;

  /** Todas las filas que matcheen, sin paginar — para armar el archivo de export */
  getAllSalesForExport(
    loggedUser: string,
    role: string | null,
    filters: ISalesFilters
  ): Promise<ISalesRow[]>;

  getDashboard(
    loggedUser: string,
    role: string | null,
    filters: IDashboardFilters
  ): Promise<IDashboardSummary>;
}
