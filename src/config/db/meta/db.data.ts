import { UserEntityData } from '../entities/user/user.entity';
import { FileEntityData } from '../entities/user/file.entity';
import { TEntitiesObj } from './db.types';
import { UserRoleEntityData } from '../entities/user/user_role.entity';
import { RoleEntityData } from '../entities/user/role.entity';
import { UserTokenSessionEntityData } from '../entities/user/user_token_session.entity';
import { FileTypeEntityData } from '../entities/user/file_type.entity';
import { OrganizationEntityData } from '../entities/user/organization.entity';
import { PasswordResetCodeEntityData } from '../entities/user/password-reset-code.entity';
import { UserOrganizationEntityData } from '../entities/user/user_organization.entity';
import { SystemParameterEntityData } from '../entities/system/system_parameter.entity';
import { UserSessionEntityData } from '../entities/user/user_session.entity';
import { EmailEntityData } from '../entities/user/email.entity';
import { EventEntityData } from '../entities/tickets/event.entity';
import { TicketTypeEntityData } from '../entities/tickets/ticket_type.entity';
import { OrderEntityData } from '../entities/tickets/order.entity';
import { OrderItemEntityData } from '../entities/tickets/order_item.entity';
import { TicketEntityData } from '../entities/tickets/ticket.entity';
import { PaymentEntityData } from '../entities/tickets/payment.entity';
import { CheckInLogEntityData } from '../entities/tickets/check_in_log.entity';
import { EventFeeSummaryEntityData } from '../entities/tickets/event_fee_summary.entity';
import { EventProducerEntityData } from '../entities/tickets/event_producer.entity';
import { EventValidatorEntityData } from '../entities/tickets/event_validator.entity';
import { TicketTransferEntityData } from '../entities/tickets/ticket_transfer.entity';

export const entitiesData = [
  UserTokenSessionEntityData,
  UserEntityData,
  FileEntityData,
  FileTypeEntityData,
  RoleEntityData,
  UserRoleEntityData,
  UserOrganizationEntityData,
  OrganizationEntityData,
  PasswordResetCodeEntityData,
  SystemParameterEntityData,
  UserSessionEntityData,
  EmailEntityData,
  EventEntityData,
  TicketTypeEntityData,
  OrderEntityData,
  OrderItemEntityData,
  TicketEntityData,
  PaymentEntityData,
  CheckInLogEntityData,
  EventFeeSummaryEntityData,
  EventProducerEntityData,
  EventValidatorEntityData,
  TicketTransferEntityData
] as const;

export const entitiesObj = entitiesData.reduce(
  (acc, entityData) => ({ ...acc, [entityData.name]: entityData.entity }),
  {} as TEntitiesObj
);
