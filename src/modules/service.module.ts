import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { DBModule } from '../config/db/db.module';
import { UserService } from './user/services/implementation/user.service';
import { RoleService } from './role/services/implementation/role.service';
import { AuthService } from './auth/services/implementation/auth.service';
import { UserFileService } from './user-file/services/implementation/user-file.service';
import { EmailService } from '@root/shared/auth/services/email.service';
import { OrganizationService } from './organization/services/implementation/organization.service';
import { OrganizationStaffService } from './organization/services/implementation/organization-staff.service';
import { UserPermissionService } from '@root/shared/services/userPermissions.service';
import { SystemParameterService } from './system-parameter/services/implementation/system-parameter.service';
import { EventService } from './event/services/implementation/event.service';
import { EventAiService } from './event/services/implementation/event-ai.service';
import { StockService } from './orders/services/implementation/stock.service';
import { OrderService } from './orders/services/implementation/order.service';
import { FeeSummaryService } from './orders/services/implementation/fee-summary.service';
import { RoleGuard } from '@root/shared/auth/guards/role.guard';
import { InternalTokenGuard } from '@root/shared/auth/guards/internal-token.guard';
import { ImageCompressionService } from '@root/shared/services/image-compression.service';
import { MercadoPagoService } from './payments/services/implementation/mercadopago.service';
import { PaymentService } from './payments/services/implementation/payment.service';
import { CheckInService } from './check-in/services/implementation/checkin.service';
import { QrGenerationModule } from './qr-generation/qr-generation.module';
import { NotificationsModule } from './notifications/notifications.module';
import { UserNotificationService } from './notifications/services/implementation/user-notification.service';
import { SupportService } from './support/services/implementation/support.service';
import { DashboardService } from './dashboard/services/implementation/dashboard.service';
import { OrgMpService } from './org-mp/services/implementation/org-mp.service';
import { OrgCatalogService } from './org-catalog/services/implementation/org-catalog.service';
import { TokenCipher } from '@root/shared/crypto/token-cipher';
import { ReportingService } from './reporting/services/implementation/reporting.service';
import { SalesExportService } from './reporting/services/implementation/sales-export.service';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    JwtModule.register({
      global: true,
      secret: 'temp-secret',
      signOptions: { expiresIn: '1d' }
    }),
    DBModule,
    QrGenerationModule,
    NotificationsModule
  ],
  providers: [
    { provide: 'IAuthService', useClass: AuthService },
    { provide: 'IUserService', useClass: UserService },
    { provide: 'IUserFileService', useClass: UserFileService },
    { provide: 'IRoleService', useClass: RoleService },
    { provide: 'IOrganizationService', useClass: OrganizationService },
    OrganizationStaffService,
    { provide: 'ISystemParameterService', useClass: SystemParameterService },
    { provide: 'IEventService', useClass: EventService },
    { provide: 'IReportingService', useClass: ReportingService },
    { provide: 'IOrgMpService', useClass: OrgMpService },
    { provide: 'IOrgCatalogService', useClass: OrgCatalogService },
    TokenCipher,
    { provide: 'ISalesExportService', useClass: SalesExportService },
    { provide: 'IEventAiService', useClass: EventAiService },
    { provide: 'IOrderService', useClass: OrderService },
    { provide: 'IPaymentService', useClass: PaymentService },
    { provide: 'ICheckInService', useClass: CheckInService },
    { provide: 'IUserNotificationService', useClass: UserNotificationService },
    { provide: 'ISupportService', useClass: SupportService },
    MercadoPagoService,
    StockService,
    FeeSummaryService,
    EmailService,
    ImageCompressionService,
    AuthService,
    RoleGuard,
    InternalTokenGuard,
    UserPermissionService,
    DashboardService
  ],
  exports: [
    { provide: 'IAuthService', useClass: AuthService },
    { provide: 'IUserService', useClass: UserService },
    { provide: 'IUserFileService', useClass: UserFileService },
    { provide: 'IRoleService', useClass: RoleService },
    { provide: 'IOrganizationService', useClass: OrganizationService },
    OrganizationStaffService,
    { provide: 'ISystemParameterService', useClass: SystemParameterService },
    { provide: 'IEventService', useClass: EventService },
    { provide: 'IReportingService', useClass: ReportingService },
    { provide: 'IOrgMpService', useClass: OrgMpService },
    { provide: 'IOrgCatalogService', useClass: OrgCatalogService },
    TokenCipher,
    { provide: 'ISalesExportService', useClass: SalesExportService },
    { provide: 'IEventAiService', useClass: EventAiService },
    { provide: 'IOrderService', useClass: OrderService },
    { provide: 'IPaymentService', useClass: PaymentService },
    { provide: 'ICheckInService', useClass: CheckInService },
    { provide: 'IUserNotificationService', useClass: UserNotificationService },
    { provide: 'ISupportService', useClass: SupportService },
    MercadoPagoService,
    StockService,
    FeeSummaryService,
    EmailService,
    ImageCompressionService,
    AuthService,
    RoleGuard,
    InternalTokenGuard,
    UserPermissionService,
    QrGenerationModule,
    NotificationsModule,
    DashboardService
  ]
})
export class ServiceModule {}
