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
import { UserPermissionService } from '@root/shared/services/userPermissions.service';
import { SystemParameterService } from './system-parameter/services/implementation/system-parameter.service';
import { RoleGuard } from '@root/shared/auth/guards/role.guard';
import { InternalTokenGuard } from '@root/shared/auth/guards/internal-token.guard';
import { ImageCompressionService } from '@root/shared/services/image-compression.service';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    JwtModule.register({
      global: true,
      secret: 'temp-secret',
      signOptions: { expiresIn: '1d' }
    }),
    DBModule
  ],
  providers: [
    { provide: 'IAuthService', useClass: AuthService },
    { provide: 'IUserService', useClass: UserService },
    { provide: 'IUserFileService', useClass: UserFileService },
    { provide: 'IRoleService', useClass: RoleService },
    { provide: 'IOrganizationService', useClass: OrganizationService },
    { provide: 'ISystemParameterService', useClass: SystemParameterService }, 
    EmailService,
    ImageCompressionService,
    AuthService,
    RoleGuard,
    InternalTokenGuard,
    UserPermissionService
  ],
  exports: [
    { provide: 'IAuthService', useClass: AuthService },
    { provide: 'IUserService', useClass: UserService },
    { provide: 'IUserFileService', useClass: UserFileService },
    { provide: 'IRoleService', useClass: RoleService },
    { provide: 'IOrganizationService', useClass: OrganizationService },
    { provide: 'ISystemParameterService', useClass: SystemParameterService },
    EmailService,
    ImageCompressionService,
    AuthService,
    RoleGuard,
    InternalTokenGuard,
    UserPermissionService
  ]
})
export class ServiceModule {}
