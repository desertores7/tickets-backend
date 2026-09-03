import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { DBRepository } from '@config/db/db.repository';
import { EventEntity } from '@config/db/entities/tickets/event.entity';
import { UserEventCashierEntity } from '@config/db/entities/tickets/user_event_cashier.entity';
import { OrganizationEntity } from '@config/db/entities/user/organization.entity';
import { ORGANIZATION_STATUS } from '@modules/organization/const/organization-status.const';
import { FeeSummaryService } from '@modules/orders/services/implementation/fee-summary.service';
import { resolveActiveRole } from '@root/shared/auth/utils/active-role';
import {
  BackofficeAdminKpisResponse,
  BackofficeAdminSectionsResponse,
  BackofficeAdminTopEventResponse,
  BackofficePendingOrganizationResponse,
  BackofficeCashierSectionsResponse,
  BackofficeProducerKpisResponse,
  BackofficeProducerSectionsResponse,
  BackofficeQuickActionResponse,
  BackofficeTodayEventResponse,
  BackofficeTopEventResponse,
  GetBackofficeDashboardResponse
} from '../../controllers/dtos/get-backoffice-dashboard/get-backoffice-dashboard.response';

type UserWithRoles = {
  uuid: string;
  userRoles?: Array<{
    isDeleted?: Date | null;
    createdAt?: Date | null;
    role?: { uuid: string; name: string } | null;
  }>;
};

const PRODUCER_UNAVAILABLE = ['cash_revenue', 'expenses', 'cash_result'] as const;
const CASHIER_UNAVAILABLE = ['cashier_incomes'] as const;

function getBuenosAiresDayRange(): { start: Date; end: Date } {
  const dateStr = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires'
  });
  return {
    start: new Date(`${dateStr}T00:00:00-03:00`),
    end: new Date(`${dateStr}T23:59:59.999-03:00`)
  };
}

function eventIntersectsDay(eventStart: Date, eventEnd: Date, dayStart: Date, dayEnd: Date): boolean {
  return eventStart <= dayEnd && eventEnd >= dayStart;
}

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DBRepository) private readonly dbRepository: DBRepository,
    private readonly feeSummaryService: FeeSummaryService
  ) {}

  async getBackofficeDashboard(userUuid: string): Promise<GetBackofficeDashboardResponse> {
    const user = await this.dbRepository.findOne({
      entity: 'user',
      where: { uuid: userUuid, isDeleted: IsNull() },
      relations: { userRoles: { role: true } } as any
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const activeRole = resolveActiveRole((user as UserWithRoles).userRoles);
    if (!activeRole) {
      throw new ForbiddenException('No tenés un rol activo para acceder al backoffice.');
    }

    const generatedAt = new Date();

    switch (activeRole.name) {
      case 'Productor':
        return this.buildProducerDashboard(userUuid, generatedAt);
      case 'Administrador':
        return this.buildAdminDashboard(generatedAt);
      case 'Caja':
        return this.buildCashierDashboard(userUuid, generatedAt);
      default:
        throw new ForbiddenException('Tu rol no tiene acceso al dashboard de backoffice.');
    }
  }

  private async buildProducerDashboard(
    userUuid: string,
    generatedAt: Date
  ): Promise<GetBackofficeDashboardResponse> {
    const org = await this.resolveMembershipOrganization(userUuid);
    const orgUuid = org.uuid;

    // Tres numeros que salen de un COUNT agregado: traer las filas para contarlas
    // en memoria escala con la cantidad de eventos de la productora.
    const [counts, aggregates, topRows] = await Promise.all([
      this.countOrganizationEvents(orgUuid),
      this.feeSummaryService.aggregateByOrganization(orgUuid),
      this.feeSummaryService.topEventsByOrganization(orgUuid, 5)
    ]);

    const kpis = new BackofficeProducerKpisResponse({
      eventsTotal: counts.total,
      eventsPublished: counts.published,
      eventsDraft: counts.draft,
      ticketsSoldWeb: aggregates.totalTicketsSold,
      ticketRevenueWeb: aggregates.ticketAmount
    });

    const sections = new BackofficeProducerSectionsResponse(
      topRows.map(
        row =>
          new BackofficeTopEventResponse({
            uuid: row.eventUuid,
            name: row.name,
            totalTicketsSold: row.totalTicketsSold,
            ticketRevenue: row.ticketAmount,
            lastOrderPaidAt: row.lastOrderPaidAt
          })
      )
    );

    return new GetBackofficeDashboardResponse({
      role: 'producer',
      currency: aggregates.currency,
      generatedAt,
      kpis,
      sections,
      unavailable: [...PRODUCER_UNAVAILABLE],
      quickActions: [
        new BackofficeQuickActionResponse({ label: 'Crear evento', href: '/producer/events/new' }),
        new BackofficeQuickActionResponse({ label: 'Ver eventos', href: '/producer/events' }),
        new BackofficeQuickActionResponse({ label: 'Ventas', href: '/producer/sales' }),
        new BackofficeQuickActionResponse({ label: 'Productora', href: '/producer/organization' })
      ]
    });
  }

  private async buildAdminDashboard(generatedAt: Date): Promise<GetBackofficeDashboardResponse> {
    // Son consultas independientes: en serie el dashboard paga la suma de todas.
    const [pendingReview, approved, bankChangePending, fiscalChangePending, eventsPublished, aggregates, topRows, pendingOrgs] =
      await Promise.all([
        this.countOrganizations({ organizationStatusUuid: ORGANIZATION_STATUS.PENDING_REVIEW.uuid }),
        this.countOrganizations({ organizationStatusUuid: ORGANIZATION_STATUS.APPROVED.uuid }),
        this.countOrganizations({ requestPending: 'bank_change' }),
        this.countOrganizations({ requestPending: 'fiscal_change' }),
        this.dbRepository.query(`SELECT COUNT(*) AS cnt FROM event WHERE isActive = 1 AND isPublished = 1`),
        this.feeSummaryService.aggregatePlatform(),
        this.feeSummaryService.topEventsPlatform(5),
        this.listPendingOrganizations(5)
      ]);

    const kpis = new BackofficeAdminKpisResponse({
      organizationsPendingReview: pendingReview,
      organizationsBankChangePending: bankChangePending,
      organizationsFiscalChangePending: fiscalChangePending,
      organizationsApproved: approved,
      eventsPublished: Number(eventsPublished?.[0]?.cnt ?? 0),
      ticketsSold: aggregates.totalTicketsSold,
      ticketRevenue: aggregates.ticketAmount,
      serviceFeeRevenue: aggregates.serviceFeeAmount,
      grossRevenue: aggregates.grossAmount
    });

    const sections = new BackofficeAdminSectionsResponse(
      topRows.map(
        row =>
          new BackofficeAdminTopEventResponse({
            uuid: row.eventUuid,
            name: row.name,
            totalTicketsSold: row.totalTicketsSold,
            ticketRevenue: row.ticketAmount,
            lastOrderPaidAt: row.lastOrderPaidAt,
            organizationUuid: row.organizationUuid,
            organizationName: row.organizationName
          })
      ),
      pendingOrgs
    );

    return new GetBackofficeDashboardResponse({
      role: 'admin',
      currency: aggregates.currency,
      generatedAt,
      kpis,
      sections,
      unavailable: [],
      quickActions: [
        new BackofficeQuickActionResponse({
          label: 'Pendientes de revisión',
          href: '/admin/organizations?validationStatus=pending_review'
        }),
        new BackofficeQuickActionResponse({
          label: 'Cambios de cuenta',
          href: '/admin/organizations?bankChangePending=true'
        }),
        new BackofficeQuickActionResponse({ label: 'Organizaciones', href: '/admin/organizations' }),
        new BackofficeQuickActionResponse({ label: 'Eventos', href: '/admin/events' })
      ]
    });
  }

  private async buildCashierDashboard(
    userUuid: string,
    generatedAt: Date
  ): Promise<GetBackofficeDashboardResponse> {
    const org = await this.resolveMembershipOrganization(userUuid);
    const { start: dayStart, end: dayEnd } = getBuenosAiresDayRange();

    const rows = await this.dbRepository.findMany({
      entity: 'user_event_cashier',
      where: { userUuid, organizationUuid: org.uuid, isDeleted: IsNull() } as any,
      relations: { event: true } as any
    });

    const todayEvents = (rows as UserEventCashierEntity[])
      .filter(row => row.event)
      .map(row => row.event as EventEntity)
      .filter(event =>
        event.isActive && eventIntersectsDay(event.startDate, event.endDate, dayStart, dayEnd)
      )
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
      .map(
        event =>
          new BackofficeTodayEventResponse({
            uuid: event.uuid,
            name: event.name,
            startDate: event.startDate,
            endDate: event.endDate,
            venueName: event.venueName
          })
      );

    const sections = new BackofficeCashierSectionsResponse(todayEvents);

    return new GetBackofficeDashboardResponse({
      role: 'cashier',
      currency: 'ARS',
      generatedAt,
      sections,
      unavailable: [...CASHIER_UNAVAILABLE],
      quickActions: [
        new BackofficeQuickActionResponse({ label: 'Ver eventos asignados', href: '/caja' })
      ]
    });
  }

  private async countOrganizations(filter: {
    organizationStatusUuid?: string;
    /** Tipo de pedido pendiente a contar (organization_request.type). */
    requestPending?: 'bank_change' | 'fiscal_change';
  }): Promise<number> {
    if (filter.requestPending) {
      const rows = await this.dbRepository.query(
        `SELECT COUNT(DISTINCT organizationUuid) AS cnt
         FROM organization_request
         WHERE isDeleted IS NULL AND status = 'pending' AND type = ?`,
        [filter.requestPending]
      );
      return Number(rows?.[0]?.cnt ?? 0);
    }

    const rows = await this.dbRepository.query(
      `SELECT COUNT(*) AS cnt FROM organization WHERE isDeleted IS NULL AND organizationStatusUuid = ?`,
      [filter.organizationStatusUuid]
    );
    return Number(rows?.[0]?.cnt ?? 0);
  }

  /** Totales de eventos de una productora en una sola pasada. */
  private async countOrganizationEvents(
    organizationUuid: string
  ): Promise<{ total: number; published: number; draft: number }> {
    const rows = await this.dbRepository.query(
      `SELECT COUNT(*) AS total, COALESCE(SUM(isPublished = 1), 0) AS published
       FROM event
       WHERE organizationUuid = ? AND isActive = 1`,
      [organizationUuid]
    );

    const total = Number(rows?.[0]?.total ?? 0);
    const published = Number(rows?.[0]?.published ?? 0);
    return { total, published, draft: total - published };
  }

  /**
   * Cola de decisiones del admin: validaciones fiscales esperando revision y
   * pedidos de cambio (banco / identidad fiscal), en una sola consulta.
   */
  private async listPendingOrganizations(limit: number): Promise<BackofficePendingOrganizationResponse[]> {
    const rows = await this.dbRepository.query(
      `
        SELECT o.uuid AS uuid, o.name AS name, 'validation' AS kind, o.updatedAt AS requestedAt
        FROM organization o
        WHERE o.isDeleted IS NULL AND o.organizationStatusUuid = ?
        UNION ALL
        SELECT o.uuid AS uuid, o.name AS name, r.type AS kind, r.createdAt AS requestedAt
        FROM organization_request r
        INNER JOIN organization o ON o.uuid = r.organizationUuid AND o.isDeleted IS NULL
        WHERE r.isDeleted IS NULL AND r.status = 'pending'
        ORDER BY requestedAt DESC
        LIMIT ?
      `,
      [ORGANIZATION_STATUS.PENDING_REVIEW.uuid, limit]
    );

    return (rows ?? []).map(
      (row: Record<string, unknown>) =>
        new BackofficePendingOrganizationResponse({
          uuid: String(row.uuid),
          name: String(row.name),
          kind: row.kind as 'validation' | 'bank_change' | 'fiscal_change',
          requestedAt: row.requestedAt ? new Date(row.requestedAt as string) : null
        })
    );
  }

  private async resolveMembershipOrganization(userUuid: string): Promise<OrganizationEntity> {
    const membership = await this.dbRepository.findOne({
      entity: 'user_organization',
      where: { userUuid, isDeleted: IsNull() },
      relations: { organization: true },
      other: { order: { createdAt: 'ASC' } }
    });

    if (!membership?.organization || membership.organization.isDeleted) {
      throw new NotFoundException('No tenés una productora asociada');
    }

    return membership.organization as OrganizationEntity;
  }
}
