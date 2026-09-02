import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import {
  IDashboardSummary,
  IDashboardTopEvent,
  IEventDashboard,
  ISalesRow
} from '../../services/contracts/ireporting.service';

export class SalesRowResponse {
  @ApiProperty() orderUuid: string;
  @ApiProperty({ example: 'ORD-20260828-000142' }) orderNumber: string;
  @ApiProperty() buyerName: string;
  @ApiProperty() buyerEmail: string;
  @ApiProperty() eventUuid: string;
  @ApiProperty() eventName: string;
  @ApiProperty({ example: 'Campo General' }) ticketTypeName: string;
  @ApiProperty() quantity: number;

  @ApiProperty({
    description: 'Valor de las entradas SIN costo de servicio (BR-REPORT-001)',
    example: 46000
  })
  amount: number;

  @ApiProperty({ example: 'ARS' }) currency: string;
  @ApiProperty() purchasedAt: Date;
  @ApiProperty({ example: 'paid' }) status: string;

  constructor(data: ISalesRow) {
    this.orderUuid = data.orderUuid;
    this.orderNumber = data.orderNumber;
    this.buyerName = data.buyerName;
    this.buyerEmail = data.buyerEmail;
    this.eventUuid = data.eventUuid;
    this.eventName = data.eventName;
    this.ticketTypeName = data.ticketTypeName;
    this.quantity = data.quantity;
    this.amount = data.amount;
    this.currency = data.currency;
    this.purchasedAt = data.purchasedAt;
    this.status = data.status;
  }
}

export class GetSalesResponse {
  @ApiProperty({ type: [SalesRowResponse] }) items: SalesRowResponse[];
  @ApiProperty({ type: PaginationMetaResponse }) meta: PaginationMetaResponse;

  @ApiProperty({
    description: 'Suma de `amount` de la página actual, sin costo de servicio',
    example: 128000
  })
  pageTotal: number;

  constructor(items: SalesRowResponse[], meta: PaginationMetaResponse) {
    this.items = items;
    this.meta = meta;
    this.pageTotal = Math.round(items.reduce((sum, i) => sum + i.amount, 0) * 100) / 100;
  }
}

export class ExpenseCategoryTotal {
  @ApiProperty() category: string;
  @ApiProperty() total: number;

  constructor(category: string, total: number) {
    this.category = category;
    this.total = total;
  }
}

export class DashboardTopEventResponse {
  @ApiProperty() uuid: string;
  @ApiProperty() name: string;
  @ApiProperty() totalTicketsSold: number;

  @ApiProperty({ description: 'Sin costo de servicio (BR-REPORT-001)' })
  ticketRevenue: number;

  @ApiProperty({ nullable: true }) lastOrderPaidAt: string | null;

  constructor(data: IDashboardTopEvent) {
    this.uuid = data.uuid;
    this.name = data.name;
    this.totalTicketsSold = data.totalTicketsSold;
    this.ticketRevenue = data.ticketRevenue;
    this.lastOrderPaidAt = data.lastOrderPaidAt ? data.lastOrderPaidAt.toISOString() : null;
  }
}

export class DashboardQuickActionResponse {
  @ApiProperty() label: string;
  @ApiProperty() href: string;

  constructor(label: string, href: string) {
    this.label = label;
    this.href = href;
  }
}

/**
 * Accesos rápidos por rol. Viven en el backend porque el mapa de API del spec
 * define la respuesta del dashboard "por rol": el frontend solo la pinta.
 */
const QUICK_ACTIONS: Record<BackofficeDashboardRole, [string, string][]> = {
  producer: [
    ['Crear evento', '/producer/events/new'],
    ['Ver ventas', '/producer/sales'],
    ['Mis eventos', '/producer/events']
  ],
  admin: [
    ['Revisar productoras', '/admin/review'],
    ['Ver ventas', '/producer/sales'],
    ['Eventos', '/producer/events']
  ],
  cashier: [['Escanear entradas', '/validador']]
};

export type BackofficeDashboardRole = 'producer' | 'admin' | 'cashier';

/**
 * Traduce el rol interno al identificador que consume el frontend.
 *
 * Un rol desconocido cae en `producer`: el alcance de datos ya lo resuelve
 * `resolveEventScope`, así que como mucho verá un dashboard vacío — nunca datos
 * de otra organización.
 */
function toDashboardRole(role: string | null): BackofficeDashboardRole {
  if (role === 'Administrador') return 'admin';
  if (role === 'Caja') return 'cashier';
  return 'producer';
}

/**
 * Respuesta del dashboard, con la forma que declara el mapa de API del spec
 * (`29` §6: "respuesta por rol"). El frontend ramifica con `role`, así que el
 * campo es obligatorio: sin él no dibuja nada.
 */
export class DashboardResponse {
  @ApiProperty({ enum: ['producer', 'admin', 'cashier'] })
  role: BackofficeDashboardRole;

  @ApiProperty({ example: 'ARS' }) currency: string;
  @ApiProperty({ description: 'ISO-8601' }) generatedAt: string;

  @ApiProperty({
    type: [String],
    description:
      'Bloques que el frontend debe mostrar como no disponibles todavía. Hoy: los de Caja (FP11).',
    example: ['cash_revenue', 'cash_result']
  })
  unavailable: string[];

  @ApiProperty({ type: [DashboardQuickActionResponse] })
  quickActions: DashboardQuickActionResponse[];

  @ApiProperty({
    description:
      'KPIs del rol. Productor (`29` §6): eventos totales/publicados/borradores, entradas web, ' +
      'recaudación web SIN costo de servicio, ingresos de caja, total, gastos, resultado estimado ' +
      'y gastos por categoría. Administrador: además productoras por estado y costo de servicio.'
  })
  kpis: Record<string, unknown>;

  @ApiProperty({ description: 'Bloques de listado. Productor: `topEvents`. Caja: `todayEvents`.' })
  sections: Record<string, unknown>;

  constructor(data: IDashboardSummary, role: string | null) {
    const dashboardRole = toDashboardRole(role);

    this.role = dashboardRole;
    this.currency = data.currency;
    this.generatedAt = new Date().toISOString();
    this.quickActions = QUICK_ACTIONS[dashboardRole].map(
      ([label, href]) => new DashboardQuickActionResponse(label, href)
    );

    // Mientras no exista el módulo de Caja (FP11) el total de ingresos no está
    // completo. Se avisa en vez de mostrar un número que parezca definitivo.
    this.unavailable = data.cashModuleAvailable ? [] : ['cash_revenue', 'cash_result'];

    const expensesByCategory = data.expensesByCategory.map(
      c => new ExpenseCategoryTotal(c.category, c.total)
    );
    const topEvents = data.topEvents.map(e => new DashboardTopEventResponse(e));

    if (dashboardRole === 'cashier') {
      this.kpis = {};
      // `todayEvents` llega vacío hasta que exista FP11; se marca como no disponible.
      this.unavailable = [...this.unavailable, 'cashier_incomes'];
      this.sections = { todayEvents: [], incomesToday: null };
      return;
    }

    // KPIs comunes: los que pide `29` §6 para el dashboard general.
    const common = {
      eventsTotal: data.eventsCount,
      eventsPublished: data.eventsPublished,
      eventsDraft: data.eventsDraft,
      ticketsSoldWeb: data.ticketsSold,
      ticketRevenueWeb: data.webRevenue,
      cashRevenue: data.cashRevenue,
      totalIncome: data.totalIncome,
      expensesTotal: data.expensesTotal,
      estimatedResult: data.estimatedResult,
      expensesByCategory
    };

    this.sections = { topEvents };

    if (dashboardRole === 'admin' && data.admin) {
      this.kpis = {
        ...common,
        // Nombres sin sufijo `Web` para el admin: su tablero es de plataforma.
        ticketsSold: data.ticketsSold,
        ticketRevenue: data.webRevenue,
        organizationsPendingReview: data.admin.organizationsPendingReview,
        organizationsBankChangePending: data.admin.organizationsBankChangePending,
        organizationsApproved: data.admin.organizationsApproved,
        serviceFeeRevenue: data.admin.serviceFeeRevenue,
        grossRevenue: data.admin.grossRevenue
      };
      return;
    }

    this.kpis = common;
  }
}

/**
 * Dashboard de un evento (`29` §17).
 *
 * Solo agregados: sin líneas de gasto, sin productos por ingreso y sin costo
 * de servicio (`BR-REPORT-001`).
 */
export class EventDashboardResponse {
  @ApiProperty() eventUuid: string;
  @ApiProperty() eventName: string;
  @ApiProperty({ description: 'ISO-8601' }) startDate: string;
  @ApiProperty({ description: 'ISO-8601' }) endDate: string;
  @ApiProperty() isPublished: boolean;

  @ApiProperty({ description: 'Entradas web vendidas, en unidades' }) ticketsSold: number;

  @ApiProperty({ description: 'Recaudación de entradas web, SIN costo de servicio' })
  webRevenue: number;

  @ApiProperty({ description: 'Entradas vendidas en puerta (BR-CASH-006)' }) doorTickets: number;
  @ApiProperty({ description: 'Cobros por posnet MP' }) mpIncome: number;
  @ApiProperty({ description: 'MP sin producto mapeado' }) transfersAndOthers: number;
  @ApiProperty({ description: 'Ingresos cargados a mano' }) manualIncome: number;
  @ApiProperty({ description: 'Devoluciones y contracargos: restan' }) mpRefunds: number;

  @ApiProperty({ description: 'Ingresos operativos netos de la caja (BR-CASH-007)' })
  cashRevenue: number;

  @ApiProperty({ description: 'webRevenue + cashRevenue' }) totalIncome: number;
  @ApiProperty() expensesTotal: number;

  @ApiProperty({
    description: 'Agregado por categoría, sin líneas ni proveedores',
    example: [{ category: 'venue', total: 180000 }]
  })
  expensesByCategory: { category: string; total: number }[];

  @ApiProperty({ description: 'totalIncome − expensesTotal' }) estimatedResult: number;
  @ApiProperty({ example: 'ARS' }) currency: string;

  constructor(data: IEventDashboard) {
    this.eventUuid = data.eventUuid;
    this.eventName = data.eventName;
    this.startDate = new Date(data.startDate).toISOString();
    this.endDate = new Date(data.endDate).toISOString();
    this.isPublished = data.isPublished;
    this.ticketsSold = data.ticketsSold;
    this.webRevenue = data.webRevenue;
    this.doorTickets = data.doorTickets;
    this.mpIncome = data.mpIncome;
    this.transfersAndOthers = data.transfersAndOthers;
    this.manualIncome = data.manualIncome;
    this.mpRefunds = data.mpRefunds;
    this.cashRevenue = data.cashRevenue;
    this.totalIncome = data.totalIncome;
    this.expensesTotal = data.expensesTotal;
    this.expensesByCategory = data.expensesByCategory;
    this.estimatedResult = data.estimatedResult;
    this.currency = data.currency;
  }
}
