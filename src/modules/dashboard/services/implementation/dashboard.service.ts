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

    const events = await this.dbRepository.findMany({
      entity: 'event',
      where: { organizationUuid: orgUuid, isActive: true } as any
    });

    const eventsPublished = events.filter(e => e.isPublished).length;
    const eventsDraft = events.length - eventsPublished;
    const aggregates = await this.feeSummaryService.aggregateByOrganization(orgUuid);
    const topRows = await this.feeSummaryService.topEventsByOrganization(orgUuid, 5);

    const kpis = new BackofficeProducerKpisResponse({
      eventsTotal: events.length,
      eventsPublished,
      eventsDraft,
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
    const pendingReview = await this.countOrganizations({
      organizationStatusUuid: ORGANIZATION_STATUS.PENDING_REVIEW.uuid
    });
    const approved = await this.countOrganizations({
      organizationStatusUuid: ORGANIZATION_STATUS.APPROVED.uuid
    });
    const bankChangePending = await this.countOrganizations({ bankChangePending: true });

    const eventsPublished = await this.dbRepository.query(
      `SELECT COUNT(*) AS cnt FROM event WHERE isActive = 1 AND isPublished = 1`
    );
    const aggregates = await this.feeSummaryService.aggregatePlatform();

    const kpis = new BackofficeAdminKpisResponse({
      organizationsPendingReview: pendingReview,
      organizationsBankChangePending: bankChangePending,
      organizationsApproved: approved,
      eventsPublished: Number(eventsPublished?.[0]?.cnt ?? 0),
      ticketsSold: aggregates.totalTicketsSold,
      ticketRevenue: aggregates.ticketAmount,
      serviceFeeRevenue: aggregates.serviceFeeAmount,
      grossRevenue: aggregates.grossAmount
    });

    return new GetBackofficeDashboardResponse({
      role: 'admin',
      currency: aggregates.currency,
      generatedAt,
      kpis,
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
    bankChangePending?: boolean;
  }): Promise<number> {
    if (filter.bankChangePending) {
      const rows = await this.dbRepository.query(
        `SELECT COUNT(*) AS cnt FROM organization WHERE isDeleted IS NULL AND bankChangeRequestedAt IS NOT NULL`
      );
      return Number(rows?.[0]?.cnt ?? 0);
    }

    const rows = await this.dbRepository.query(
      `SELECT COUNT(*) AS cnt FROM organization WHERE isDeleted IS NULL AND organizationStatusUuid = ?`,
      [filter.organizationStatusUuid]
    );
    return Number(rows?.[0]?.cnt ?? 0);
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
