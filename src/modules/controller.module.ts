import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { ServiceModule } from './service.module';
import { DBModule } from '../config/db/db.module';
import { UserController } from './user/controllers/user.controller';
import { RoleController } from './role/controllers/role.controller';
import { AuthController } from './auth/controllers/auth.controller';
import { UserFileController } from './user-file/controllers/user-file.controller';
import { OrganizationController } from './organization/controllers/organization.controller';
import { SystemParameterController } from './system-parameter/controllers/system-parameter.controller';
import { EventController } from './event/controllers/event.controller';
import { OrderController } from './orders/controllers/order.controller';
import { PaymentController } from './payments/controllers/payment.controller';
import { CheckInController } from './check-in/controllers/checkin.controller';
import { UserNotificationController } from './notifications/controllers/user-notification.controller';
import { SupportController } from './support/controllers/support.controller';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'user-jwt' }), ConfigModule, DBModule, ServiceModule],
  controllers: [
    AuthController,
    UserController,
    UserFileController,
    OrganizationController,
    RoleController,
    SystemParameterController,
    EventController,
    OrderController,
    PaymentController,
    CheckInController,
    UserNotificationController,
    SupportController
  ]
})
export class ControllerModule {}
