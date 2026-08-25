import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { isProfileFile } from '@config/db/const/file-type.const';
import { TUserLoginAuthResponse } from '@modules/auth/services/contracts/iauth.service';
import { MeOrganizationResponse } from './me.response';
import { resolveActiveRole } from '@root/shared/auth/utils/active-role';
import { organizationStatusName } from '@modules/organization/const/organization-fiscal.const';

export class UserResponse {
  @ApiProperty({ name: 'uuid' })
  uuid: string;

  @ApiProperty({ name: 'firstName' })
  firstName: string;

  @ApiProperty({ name: 'lastName' })
  lastName: string;

  @ApiProperty({ name: 'email' })
  email: string;

  @ApiProperty({ name: 'emailVerified' })
  emailVerified: boolean;

  @ApiProperty({
    name: 'imgProfile',
    type: 'object',
    properties: {
      url: { type: 'string' },
      type: { type: 'string' }
    }
  })
  imgProfile: object;

  @ApiProperty({ name: 'roleUuid' })
  roleUuid?: string;

  @ApiProperty({ name: 'role' })
  role?: string;

  constructor(user: TUserLoginAuthResponse) {
    this.uuid = user.uuid;
    this.firstName = user.firstName;
    this.lastName = user.lastName;
    this.email = user.email;
    this.emailVerified = Boolean(user.emailVerified);
    this.imgProfile = {
      url: user.files?.find(file => isProfileFile(file))?.path || '',
      type: user.files?.find(file => isProfileFile(file))?.type || ''
    };
    const activeRole = resolveActiveRole(user.userRoles as any);

    this.roleUuid = activeRole?.uuid ?? undefined;
    this.role = activeRole?.name ?? undefined;
  }
}

export class LoginAuthResponse {
  @ApiPropertyOptional({
    description: 'true si hay que completar el challenge 2FA por email antes de emitir tokens'
  })
  requiresTwoFactor?: boolean;

  @ApiPropertyOptional({ description: 'Email al que se envió el código (solo si requiresTwoFactor)' })
  email?: string;

  @ApiPropertyOptional({ name: 'access_token' })
  access_token?: string;

  @ApiPropertyOptional({ name: 'refresh_token' })
  refresh_token?: string;

  @ApiPropertyOptional({ name: 'user', type: UserResponse })
  user?: UserResponse;

  @ApiPropertyOptional({ name: 'organizations', type: [MeOrganizationResponse] })
  organizations?: MeOrganizationResponse[];

  constructor(
    loginInfo:
      | { requiresTwoFactor: true; email: string }
      | (TUserLoginAuthResponse & { requiresTwoFactor?: false })
  ) {
    if ('requiresTwoFactor' in loginInfo && loginInfo.requiresTwoFactor === true) {
      this.requiresTwoFactor = true;
      this.email = loginInfo.email;
      return;
    }

    this.requiresTwoFactor = false;
    this.access_token = loginInfo.access_token;
    this.refresh_token = loginInfo.refresh_token;
    this.user = new UserResponse(loginInfo);
    this.organizations = (loginInfo.userOrganizations ?? [])
      .filter(uo => !uo.isDeleted && uo.organization && !uo.organization.isDeleted)
      .map(
        uo =>
          new MeOrganizationResponse({
            uuid: uo.organization.uuid,
            name: uo.organization.name,
            active: uo.organization.active,
            validationStatus: organizationStatusName(uo.organization)
          })
      );
  }
}
