import { Inject, Injectable } from '@nestjs/common';
import { DataSource, In, IsNull, Not } from 'typeorm';
import { DBRepository } from '@config/db/db.repository';
import { OrderStatus } from '@config/db/entities/tickets/order.entity';
import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import {
  IAdminDashboardSummary,
  IDashboardFilters,
  IDashboardSummary,
  IDashboardTopEvent,
  IReportingService,
  ISalesFilters,
  ISalesRow
} from '../contracts/ireporting.service';

import { ORGANIZATION_STATUS } from '@root/modules/organization/const/organization-status.const';

/** Estados que cuentan como venta concretada */
const SOLD_STATUSES = [OrderStatus.PAID, OrderStatus.REFUNDED];

/** Cuantos eventos entran en el ranking del dashboard */
const TOP_EVENTS_LIMIT = 5;

@Injectable()
export class ReportingService implements IReportingService {
  constructor(
    @Inject(DBRepository) private readonly dbRepository: DBRepository,
    private readonly dataSource: DataSource
  ) {}

  // ── Ventas (BR-REPORT-002) ──────────────────────────────────────────────────

  async getSales(
    loggedUser: string,
    role: string | null,
    filters: ISalesFilters,
    pagination: IPaginationParams
  ): Promise<{ meta: PaginationMetaResponse; items: ISalesRow[] }> {
    const scope = await this.resolveEventScope(loggedUser, role, filters.eventUuid);
    if (scope.empty) {
      return {
        meta: new PaginationMetaResponse({ limit: pagination.limit, page: pagination.page, total: 0 }),
        items: []
      };
    }

    const qb = this.buildSalesQuery(scope.eventUuids, filters);

    const total = await qb.clone().getCount();
    const rows = await qb
      .orderBy('o.createdAt', 'DESC')
      .limit(pagination.limit)
      .offset((pagination.page - 1) * pagination.limit)
      .getRawMany();

    return {
      meta: new PaginationMetaResponse({ limit: pagination.limit, page: pagination.page, total }),
      items: rows.map(r => this.toSalesRow(r))
    };
  }

  async getAllSalesForExport(
    loggedUser: string,
    role: string | null,
    filters: ISalesFilters
  ): Promise<ISalesRow[]> {
    const scope = await this.resolveEventScope(loggedUser, role, filters.eventUuid);
    if (scope.empty) return [];

    const rows = await this.buildSalesQuery(scope.eventUuids, filters)
      .orderBy('o.createdAt', 'DESC')
      .getRawMany();

    return rows.map(r => this.toSalesRow(r));
  }

  /**
   * Una fila por `order_item`: la compra de N entradas de un mismo tipo.
   *
   * Se seleccionan campos explícitos y NUNCA `o.serviceFee` ni `o.total`:
   * omitir el costo de servicio del SELECT es más seguro que filtrarlo después,
   * porque no puede colarse por un `SELECT *` en un cambio futuro
   * (`BR-REPORT-001`).
   */
  private buildSalesQuery(eventUuids: string[] | null, filters: ISalesFilters) {
    const qb = this.dataSource
      .createQueryBuilder()
      .select([
        'o.uuid AS orderUuid',
        'o.orderNumber AS orderNumber',
        'o.createdAt AS purchasedAt',
        'o.status AS status',
        'o.currency AS currency',
        'u.firstName AS buyerFirstName',
        'u.lastName AS buyerLastName',
        'u.email AS buyerEmail',
        'e.uuid AS eventUuid',
        'e.name AS eventName',
        'tt.name AS ticketTypeName',
        'oi.quantity AS quantity',
        'oi.subtotal AS amount'
      ])
      .from('order_item', 'oi')
      .innerJoin('orders', 'o', 'o.uuid = oi.orderUuid')
      .innerJoin('user', 'u', 'u.uuid = o.userUuid')
      .innerJoin('event', 'e', 'e.uuid = o.eventUuid')
      .innerJoin('ticket_type', 'tt', 'tt.uuid = oi.ticketTypeUuid')
      .where('o.status IN (:...soldStatuses)', { soldStatuses: SOLD_STATUSES });

    // null = administrador sin filtro de evento: ve todo
    if (eventUuids) qb.andWhere('o.eventUuid IN (:...eventUuids)', { eventUuids });

    if (filters.ticketTypeUuid) {
      qb.andWhere('oi.ticketTypeUuid = :ticketTypeUuid', { ticketTypeUuid: filters.ticketTypeUuid });
    }
    if (filters.status) {
      qb.andWhere('o.status = :status', { status: filters.status });
    }
    if (filters.dateFrom) {
      qb.andWhere('o.createdAt >= :dateFrom', { dateFrom: `${filters.dateFrom} 00:00:00` });
    }
    if (filters.dateTo) {
      // Hasta el final del día: si no, un filtro "hasta hoy" excluye lo de hoy
      qb.andWhere('o.createdAt <= :dateTo', { dateTo: `${filters.dateTo} 23:59:59` });
    }
    if (filters.search?.trim()) {
      const term = `%${filters.search.trim()}%`;
      qb.andWhere(
        '(u.firstName LIKE :term OR u.lastName LIKE :term OR u.email LIKE :term OR o.orderNumber LIKE :term)',
        { term }
      );
    }

    return qb;
  }

  private toSalesRow(raw: Record<string, unknown>): ISalesRow {
    return {
      orderUuid: String(raw.orderUuid),
      orderNumber: String(raw.orderNumber),
      buyerName: `${raw.buyerFirstName ?? ''} ${raw.buyerLastName ?? ''}`.trim(),
      buyerEmail: String(raw.buyerEmail ?? ''),
      eventUuid: String(raw.eventUuid),
      eventName: String(raw.eventName),
      ticketTypeName: String(raw.ticketTypeName),
      quantity: Number(raw.quantity),
      amount: Number(raw.amount),
      currency: String(raw.currency ?? 'ARS'),
      purchasedAt: new Date(raw.purchasedAt as string),
      status: String(raw.status)
    };
  }

  // ── Dashboard (BR-BACKOFFICE-002) ───────────────────────────────────────────

  async getDashboard(
    loggedUser: string,
    role: string | null,
    filters: IDashboardFilters
  ): Promise<IDashboardSummary> {
    const scope = await this.resolveEventScope(loggedUser, role);
    const empty = this.emptyDashboard();
    if (scope.empty) return empty;

    const [sales, expenses, eventCounts, topEvents] = await Promise.all([
      this.aggregateWebSales(scope.eventUuids, filters),
      this.aggregateExpenses(scope.eventUuids, filters),
      this.countEventsByState(scope.eventUuids),
      this.aggregateTopEvents(scope.eventUuids, filters)
    ]);

    const eventsCount = eventCounts.total;

    // El módulo de Caja (FP11) todavía no existe: los ingresos operativos van en
    // 0 y se avisa con `cashModuleAvailable` para que el frontend no muestre un
    // "total" que parezca completo cuando no lo es.
    const cashRevenue = 0;
    const totalIncome = this.round(sales.revenue + cashRevenue);

    return {
      eventsCount,
      eventsPublished: eventCounts.published,
      eventsDraft: eventCounts.draft,
      ticketsSold: sales.tickets,
      webRevenue: sales.revenue,
      cashRevenue,
      totalIncome,
      expensesTotal: expenses.total,
      estimatedResult: this.round(totalIncome - expenses.total),
      expensesByCategory: expenses.byCategory,
      topEvents,
      currency: 'ARS',
      cashModuleAvailable: false,
      admin: role === 'Administrador' ? await this.aggregateAdminKpis(filters) : undefined
    };
  }

  /**
   * Recaudación de entradas SIN el costo de servicio: se suma `oi.subtotal`
   * (precio de entrada × cantidad) y no `o.total`, que incluye el fee.
   */
  private async aggregateWebSales(
    eventUuids: string[] | null,
    filters: IDashboardFilters
  ): Promise<{ revenue: number; tickets: number }> {
    const qb = this.dataSource
      .createQueryBuilder()
      .select('COALESCE(SUM(oi.subtotal), 0)', 'revenue')
      .addSelect('COALESCE(SUM(oi.quantity), 0)', 'tickets')
      .from('order_item', 'oi')
      .innerJoin('orders', 'o', 'o.uuid = oi.orderUuid')
      .where('o.status IN (:...soldStatuses)', { soldStatuses: SOLD_STATUSES });

    if (eventUuids) qb.andWhere('o.eventUuid IN (:...eventUuids)', { eventUuids });
    if (filters.dateFrom) qb.andWhere('o.createdAt >= :dateFrom', { dateFrom: `${filters.dateFrom} 00:00:00` });
    if (filters.dateTo) qb.andWhere('o.createdAt <= :dateTo', { dateTo: `${filters.dateTo} 23:59:59` });

    const raw = await qb.getRawOne();
    return { revenue: this.round(Number(raw?.revenue ?? 0)), tickets: Number(raw?.tickets ?? 0) };
  }

  private async aggregateExpenses(
    eventUuids: string[] | null,
    filters: IDashboardFilters
  ): Promise<{ total: number; byCategory: { category: string; total: number }[] }> {
    const qb = this.dataSource
      .createQueryBuilder()
      .select('ex.category', 'category')
      .addSelect('COALESCE(SUM(ex.totalAmount), 0)', 'total')
      .from('event_expense', 'ex')
      .where('ex.isDeleted IS NULL');

    if (eventUuids) qb.andWhere('ex.eventUuid IN (:...eventUuids)', { eventUuids });
    if (filters.dateFrom) qb.andWhere('ex.expenseDate >= :dateFrom', { dateFrom: filters.dateFrom });
    if (filters.dateTo) qb.andWhere('ex.expenseDate <= :dateTo', { dateTo: filters.dateTo });

    const rows = await qb.groupBy('ex.category').getRawMany();

    const byCategory = rows
      .map(r => ({ category: String(r.category), total: this.round(Number(r.total)) }))
      .sort((a, b) => b.total - a.total);

    return {
      total: this.round(byCategory.reduce((sum, c) => sum + c.total, 0)),
      byCategory
    };
  }

  // ── Alcance ─────────────────────────────────────────────────────────────────

  /**
   * Qué eventos puede ver quien consulta.
   *
   * Devuelve `null` en `eventUuids` para un Administrador sin filtro: significa
   * "todos", y evita cargar en memoria una lista de uuids que puede ser enorme.
   */
  private async resolveEventScope(
    loggedUser: string,
    role: string | null,
    eventUuidFilter?: string
  ): Promise<{ eventUuids: string[] | null; empty: boolean }> {
    if (role === 'Administrador') {
      return { eventUuids: eventUuidFilter ? [eventUuidFilter] : null, empty: false };
    }

    const memberships = await this.dbRepository.findMany({
      entity: 'user_organization',
      where: { userUuid: loggedUser, isDeleted: IsNull() } as any
    });
    const orgUuids = [...new Set(memberships.map((m: any) => m.organizationUuid))];

    if (orgUuids.length === 0) return { eventUuids: [], empty: true };

    const events = await this.dbRepository.findMany({
      entity: 'event',
      where: { organizationUuid: In(orgUuids) } as any,
      select: { uuid: true }
    });
    let uuids = events.map((e: any) => e.uuid);

    // Un filtro por evento ajeno no debe devolver datos de otro
    if (eventUuidFilter) uuids = uuids.filter(u => u === eventUuidFilter);

    return { eventUuids: uuids, empty: uuids.length === 0 };
  }

  /**
   * Publicados vs borradores en una sola consulta agrupada: el dashboard
   * muestra los tres numeros juntos y no tiene sentido pegarle dos veces.
   */
  private async countEventsByState(
    eventUuids: string[] | null
  ): Promise<{ total: number; published: number; draft: number }> {
    const qb = this.dataSource
      .createQueryBuilder()
      .select('COUNT(*)', 'total')
      .addSelect('COALESCE(SUM(e.isPublished = 1), 0)', 'published')
      .from('event', 'e');

    if (eventUuids) qb.where('e.uuid IN (:...eventUuids)', { eventUuids });

    const raw = await qb.getRawOne();
    const total = Number(raw?.total ?? 0);
    const published = Number(raw?.published ?? 0);
    return { total, published, draft: total - published };
  }

  /**
   * Eventos con mas recaudacion. Mismo criterio que `webRevenue`: se suma
   * `oi.subtotal` y nunca `o.total`, que incluye el costo de servicio
   * (BR-REPORT-001).
   */
  private async aggregateTopEvents(
    eventUuids: string[] | null,
    filters: IDashboardFilters
  ): Promise<IDashboardTopEvent[]> {
    const qb = this.dataSource
      .createQueryBuilder()
      .select('e.uuid', 'uuid')
      .addSelect('e.name', 'name')
      .addSelect('COALESCE(SUM(oi.quantity), 0)', 'tickets')
      .addSelect('COALESCE(SUM(oi.subtotal), 0)', 'revenue')
      .addSelect('MAX(o.createdAt)', 'lastOrderPaidAt')
      .from('order_item', 'oi')
      .innerJoin('orders', 'o', 'o.uuid = oi.orderUuid')
      .innerJoin('event', 'e', 'e.uuid = o.eventUuid')
      .where('o.status IN (:...soldStatuses)', { soldStatuses: SOLD_STATUSES });

    if (eventUuids) qb.andWhere('o.eventUuid IN (:...eventUuids)', { eventUuids });
    if (filters.dateFrom) {
      qb.andWhere('o.createdAt >= :dateFrom', { dateFrom: `${filters.dateFrom} 00:00:00` });
    }
    if (filters.dateTo) {
      qb.andWhere('o.createdAt <= :dateTo', { dateTo: `${filters.dateTo} 23:59:59` });
    }

    const rows = await qb
      .groupBy('e.uuid')
      .addGroupBy('e.name')
      .orderBy('revenue', 'DESC')
      .limit(TOP_EVENTS_LIMIT)
      .getRawMany();

    return rows.map(r => ({
      uuid: String(r.uuid),
      name: String(r.name),
      totalTicketsSold: Number(r.tickets),
      ticketRevenue: this.round(Number(r.revenue)),
      lastOrderPaidAt: r.lastOrderPaidAt ? new Date(r.lastOrderPaidAt) : null
    }));
  }

  /**
   * Metricas de plataforma. Solo se invoca para el Administrador, que es el
   * unico que puede ver el costo de servicio (BR-REPORT-001).
   */
  private async aggregateAdminKpis(filters: IDashboardFilters): Promise<IAdminDashboardSummary> {
    const countByStatus = (statusUuid: string) =>
      this.dbRepository.count({
        entity: 'organization',
        where: { organizationStatusUuid: statusUuid, isDeleted: IsNull() } as any
      });

    const feeQb = this.dataSource
      .createQueryBuilder()
      .select('COALESCE(SUM(o.serviceFee), 0)', 'fee')
      .addSelect('COALESCE(SUM(o.total), 0)', 'gross')
      .from('orders', 'o')
      .where('o.status IN (:...soldStatuses)', { soldStatuses: SOLD_STATUSES });

    if (filters.dateFrom) {
      feeQb.andWhere('o.createdAt >= :dateFrom', { dateFrom: `${filters.dateFrom} 00:00:00` });
    }
    if (filters.dateTo) {
      feeQb.andWhere('o.createdAt <= :dateTo', { dateTo: `${filters.dateTo} 23:59:59` });
    }

    const [pendingReview, approved, bankPending, totals] = await Promise.all([
      countByStatus(ORGANIZATION_STATUS.PENDING_REVIEW.uuid),
      countByStatus(ORGANIZATION_STATUS.APPROVED.uuid),
      this.dbRepository.count({
        entity: 'organization',
        where: { bankChangeRequestedAt: Not(IsNull()), isDeleted: IsNull() } as any
      }),
      feeQb.getRawOne()
    ]);

    return {
      organizationsPendingReview: pendingReview,
      organizationsBankChangePending: bankPending,
      organizationsApproved: approved,
      serviceFeeRevenue: this.round(Number(totals?.fee ?? 0)),
      grossRevenue: this.round(Number(totals?.gross ?? 0))
    };
  }

  private emptyDashboard(): IDashboardSummary {
    return {
      eventsCount: 0,
      eventsPublished: 0,
      eventsDraft: 0,
      ticketsSold: 0,
      webRevenue: 0,
      cashRevenue: 0,
      totalIncome: 0,
      expensesTotal: 0,
      estimatedResult: 0,
      expensesByCategory: [],
      topEvents: [],
      currency: 'ARS',
      cashModuleAvailable: false
    };
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
