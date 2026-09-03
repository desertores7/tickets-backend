import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BackofficeQuickActionResponse {
  @ApiProperty({ example: 'Ver eventos' })
  label: string;

  @ApiProperty({ example: '/producer/events' })
  href: string;

  constructor(data: { label: string; href: string }) {
    this.label = data.label;
    this.href = data.href;
  }
}

export class BackofficeTopEventResponse {
  @ApiProperty()
  uuid: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  totalTicketsSold: number;

  @ApiProperty()
  ticketRevenue: number;

  @ApiProperty({ nullable: true })
  lastOrderPaidAt: Date | null;

  constructor(data: {
    uuid: string;
    name: string;
    totalTicketsSold: number;
    ticketRevenue: number;
    lastOrderPaidAt: Date | null;
  }) {
    this.uuid = data.uuid;
    this.name = data.name;
    this.totalTicketsSold = data.totalTicketsSold;
    this.ticketRevenue = data.ticketRevenue;
    this.lastOrderPaidAt = data.lastOrderPaidAt;
  }
}

export class BackofficeTodayEventResponse {
  @ApiProperty()
  uuid: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  startDate: Date;

  @ApiProperty()
  endDate: Date;

  @ApiProperty()
  venueName: string;

  constructor(data: {
    uuid: string;
    name: string;
    startDate: Date;
    endDate: Date;
    venueName: string;
  }) {
    this.uuid = data.uuid;
    this.name = data.name;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.venueName = data.venueName;
  }
}

/** Fila del top de eventos de la plataforma: suma la productora dueña. */
export class BackofficeAdminTopEventResponse extends BackofficeTopEventResponse {
  @ApiProperty()
  organizationUuid: string;

  @ApiProperty()
  organizationName: string;

  constructor(data: {
    uuid: string;
    name: string;
    totalTicketsSold: number;
    ticketRevenue: number;
    lastOrderPaidAt: Date | null;
    organizationUuid: string;
    organizationName: string;
  }) {
    super(data);
    this.organizationUuid = data.organizationUuid;
    this.organizationName = data.organizationName;
  }
}

/** Productora esperando una decisión del admin. */
export class BackofficePendingOrganizationResponse {
  @ApiProperty()
  uuid: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: ['validation', 'bank_change', 'fiscal_change'] })
  kind: 'validation' | 'bank_change' | 'fiscal_change';

  @ApiProperty({ nullable: true, description: 'Cuándo entró el pedido.' })
  requestedAt: Date | null;

  constructor(data: {
    uuid: string;
    name: string;
    kind: 'validation' | 'bank_change' | 'fiscal_change';
    requestedAt: Date | null;
  }) {
    this.uuid = data.uuid;
    this.name = data.name;
    this.kind = data.kind;
    this.requestedAt = data.requestedAt;
  }
}

export class BackofficeAdminSectionsResponse {
  @ApiProperty({ type: [BackofficeAdminTopEventResponse] })
  topEvents: BackofficeAdminTopEventResponse[];

  @ApiProperty({ type: [BackofficePendingOrganizationResponse] })
  pendingOrganizations: BackofficePendingOrganizationResponse[];

  constructor(
    topEvents: BackofficeAdminTopEventResponse[],
    pendingOrganizations: BackofficePendingOrganizationResponse[]
  ) {
    this.topEvents = topEvents;
    this.pendingOrganizations = pendingOrganizations;
  }
}

export class BackofficeProducerKpisResponse {
  @ApiProperty()
  eventsTotal: number;

  @ApiProperty()
  eventsPublished: number;

  @ApiProperty()
  eventsDraft: number;

  @ApiProperty()
  ticketsSoldWeb: number;

  @ApiProperty({ description: 'Recaudación web sin costo de servicio (BR-REPORT-001).' })
  ticketRevenueWeb: number;

  constructor(data: {
    eventsTotal: number;
    eventsPublished: number;
    eventsDraft: number;
    ticketsSoldWeb: number;
    ticketRevenueWeb: number;
  }) {
    this.eventsTotal = data.eventsTotal;
    this.eventsPublished = data.eventsPublished;
    this.eventsDraft = data.eventsDraft;
    this.ticketsSoldWeb = data.ticketsSoldWeb;
    this.ticketRevenueWeb = data.ticketRevenueWeb;
  }
}

export class BackofficeAdminKpisResponse {
  @ApiProperty()
  organizationsPendingReview: number;

  @ApiProperty()
  organizationsBankChangePending: number;

  @ApiProperty({ description: 'Cambios de identidad fiscal esperando decisión.' })
  organizationsFiscalChangePending: number;

  @ApiProperty()
  organizationsApproved: number;

  @ApiProperty()
  eventsPublished: number;

  @ApiProperty()
  ticketsSold: number;

  @ApiProperty()
  ticketRevenue: number;

  @ApiProperty({ description: 'Costo de servicio agregado — solo Administrador.' })
  serviceFeeRevenue: number;

  @ApiProperty({ description: 'Bruto agregado — solo Administrador.' })
  grossRevenue: number;

  constructor(data: {
    organizationsPendingReview: number;
    organizationsBankChangePending: number;
    organizationsFiscalChangePending: number;
    organizationsApproved: number;
    eventsPublished: number;
    ticketsSold: number;
    ticketRevenue: number;
    serviceFeeRevenue: number;
    grossRevenue: number;
  }) {
    this.organizationsPendingReview = data.organizationsPendingReview;
    this.organizationsBankChangePending = data.organizationsBankChangePending;
    this.organizationsFiscalChangePending = data.organizationsFiscalChangePending;
    this.organizationsApproved = data.organizationsApproved;
    this.eventsPublished = data.eventsPublished;
    this.ticketsSold = data.ticketsSold;
    this.ticketRevenue = data.ticketRevenue;
    this.serviceFeeRevenue = data.serviceFeeRevenue;
    this.grossRevenue = data.grossRevenue;
  }
}

export class BackofficeProducerSectionsResponse {
  @ApiProperty({ type: [BackofficeTopEventResponse] })
  topEvents: BackofficeTopEventResponse[];

  constructor(topEvents: BackofficeTopEventResponse[]) {
    this.topEvents = topEvents;
  }
}

export class BackofficeCashierSectionsResponse {
  @ApiProperty({ type: [BackofficeTodayEventResponse] })
  todayEvents: BackofficeTodayEventResponse[];

  @ApiProperty({
    nullable: true,
    description: 'Ingresos de caja del día — disponible cuando FP11 esté activo.'
  })
  incomesToday: null;

  constructor(todayEvents: BackofficeTodayEventResponse[]) {
    this.todayEvents = todayEvents;
    this.incomesToday = null;
  }
}

export class GetBackofficeDashboardResponse {
  @ApiProperty({ enum: ['producer', 'admin', 'cashier'] })
  role: 'producer' | 'admin' | 'cashier';

  @ApiProperty({ example: 'ARS' })
  currency: string;

  @ApiProperty()
  generatedAt: Date;

  @ApiPropertyOptional({ type: BackofficeProducerKpisResponse })
  kpis?: BackofficeProducerKpisResponse | BackofficeAdminKpisResponse;

  @ApiPropertyOptional()
  sections?:
    | BackofficeProducerSectionsResponse
    | BackofficeAdminSectionsResponse
    | BackofficeCashierSectionsResponse;

  @ApiProperty({
    type: [String],
    description: 'IDs de métricas aún no disponibles en backend (FP08/FP11).'
  })
  unavailable: string[];

  @ApiProperty({ type: [BackofficeQuickActionResponse] })
  quickActions: BackofficeQuickActionResponse[];

  constructor(data: GetBackofficeDashboardResponse) {
    this.role = data.role;
    this.currency = data.currency;
    this.generatedAt = data.generatedAt;
    this.kpis = data.kpis;
    this.sections = data.sections;
    this.unavailable = data.unavailable;
    this.quickActions = data.quickActions;
  }
}
