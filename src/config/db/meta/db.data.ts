import { UserEntityData } from '../entities/user/user.entity';
import { FileEntityData } from '../entities/user/file.entity';
import { TEntitiesObj } from './db.types';
import { UserRoleEntityData } from '../entities/user/user_role.entity';
import { RoleEntityData } from '../entities/user/role.entity';
import { UserTokenSessionEntityData } from '../entities/user/user_token_session.entity';
import { FileTypeEntityData } from '../entities/user/file_type.entity';
import { OrganizationEntityData } from '../entities/user/organization.entity';
import { OrganizationStatusEntityData } from '../entities/user/organization-status.entity';
import { PasswordResetCodeEntityData } from '../entities/user/password-reset-code.entity';
import { UserOrganizationEntityData } from '../entities/user/user_organization.entity';
import { SystemParameterEntityData } from '../entities/system/system_parameter.entity';
import { UserSessionEntityData } from '../entities/user/user_session.entity';
import { EmailEntityData } from '../entities/user/email.entity';
import { EventEntityData } from '../entities/tickets/event.entity';
import { EventChangeEntityData } from '../entities/tickets/event_change.entity';
import { EventMediaEntityData } from '../entities/tickets/event_media.entity';
import { EventMapEntityData } from '../entities/tickets/event_map.entity';
import { EventMapSectorEntityData } from '../entities/tickets/event_map_sector.entity';
import { EventMapSectorTicketTypeEntityData } from '../entities/tickets/event_map_sector_ticket_type.entity';
import { TicketTypeEntityData } from '../entities/tickets/ticket_type.entity';
import { OrderEntityData } from '../entities/tickets/order.entity';
import { OrderItemEntityData } from '../entities/tickets/order_item.entity';
import { TicketEntityData } from '../entities/tickets/ticket.entity';
import { PaymentEntityData } from '../entities/tickets/payment.entity';
import { CheckInLogEntityData } from '../entities/tickets/check_in_log.entity';
import { EventFeeSummaryEntityData } from '../entities/tickets/event_fee_summary.entity';
import { EventProducerEntityData } from '../entities/tickets/event_producer.entity';
import { EventValidatorEntityData } from '../entities/tickets/event_validator.entity';
import { EventExpenseEntityData } from '../entities/tickets/event_expense.entity';
import { OrgMpAccountEntityData } from '../entities/tickets/org_mp_account.entity';
import { OrgManualItemEntityData } from '../entities/tickets/org_manual_item.entity';
import { MpCatalogItemEntityData } from '../entities/tickets/mp_catalog_item.entity';
import { PayoutEntityData } from '../entities/tickets/payout.entity';
import { StockAlertEntityData } from '../entities/tickets/stock_alert.entity';
import { CouponEntityData } from '../entities/tickets/coupon.entity';
import { CouponRedemptionEntityData } from '../entities/tickets/coupon_redemption.entity';
import { CouponTicketTypeEntityData } from '../entities/tickets/coupon_ticket_type.entity';
import { EventMpAccountEntityData } from '../entities/tickets/event_mp_account.entity';
import { EventIncomeEntityData } from '../entities/tickets/event_income.entity';
import { EventIncomeProductEntityData } from '../entities/tickets/event_income_product.entity';
import { MpMovementEntityData } from '../entities/tickets/mp_movement.entity';
import { UserNotificationEntityData } from '../entities/user/user_notification.entity';
import { OrganizationProducerInviteEntityData } from '../entities/user/organization-producer-invite.entity';
import { OrganizationRequestEntityData } from '../entities/user/organization_request.entity';
import { UserEventCashierEntityData } from '../entities/tickets/user_event_cashier.entity';

export const entitiesData = [
  UserTokenSessionEntityData,
  UserEntityData,
  UserNotificationEntityData,
  FileEntityData,
  FileTypeEntityData,
  RoleEntityData,
  UserRoleEntityData,
  UserOrganizationEntityData,
  OrganizationEntityData,
  OrganizationStatusEntityData,
  PasswordResetCodeEntityData,
  SystemParameterEntityData,
  UserSessionEntityData,
  EmailEntityData,
  EventEntityData,
  EventChangeEntityData,
  EventMediaEntityData,
  EventMapEntityData,
  EventMapSectorEntityData,
  EventMapSectorTicketTypeEntityData,
  TicketTypeEntityData,
  OrderEntityData,
  OrderItemEntityData,
  TicketEntityData,
  PaymentEntityData,
  CheckInLogEntityData,
  EventFeeSummaryEntityData,
  EventProducerEntityData,
  EventValidatorEntityData,
  EventExpenseEntityData,
  OrgMpAccountEntityData,
  OrgManualItemEntityData,
  MpCatalogItemEntityData,
  PayoutEntityData,
  StockAlertEntityData,
  CouponEntityData,
  CouponRedemptionEntityData,
  CouponTicketTypeEntityData,
  EventMpAccountEntityData,
  EventIncomeEntityData,
  EventIncomeProductEntityData,
  MpMovementEntityData,
  UserEventCashierEntityData,
  OrganizationProducerInviteEntityData,
  OrganizationRequestEntityData
] as const;

export const entitiesObj = entitiesData.reduce(
  (acc, entityData) => ({ ...acc, [entityData.name]: entityData.entity }),
  {} as TEntitiesObj
);
