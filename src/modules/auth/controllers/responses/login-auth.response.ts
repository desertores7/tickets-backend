import { ApiProperty } from '@nestjs/swagger';
import { isProfileFile } from '@config/db/const/file-type.const';
import { TUserLoginAuthResponse } from '@modules/auth/services/contracts/iauth.service';
import { MeOrganizationResponse } from './me.response';

export class UserResponse {
  @ApiProperty({ name: 'uuid' })
  uuid: string;

  @ApiProperty({ name: 'firstName' })
  firstName: string;

  @ApiProperty({ name: 'lastName' })
  lastName: string;

  @ApiProperty({ name: 'email' })
  email: string;

  @ApiProperty({ name: 'imgProfile' })
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
    this.imgProfile = {
      url: user.files?.find(file => isProfileFile(file))?.path || '',
      type: user.files?.find(file => isProfileFile(file))?.type || ''
    };
    this.roleUuid = user.userRoles?.find(role => role.userUuid === user.uuid)?.role?.uuid ?? undefined;
    this.role = user.userRoles?.find(role => role.userUuid === user.uuid)?.role?.name ?? undefined;
  }
}

export class LoginAuthResponse {
  @ApiProperty({ name: 'access_token' })
  access_token: string;

  @ApiProperty({ name: 'refresh_token' })
  refresh_token: string;

  @ApiProperty({ name: 'user' })
  user: UserResponse;

  @ApiProperty({ name: 'organizations', type: [MeOrganizationResponse] })
  organizations: MeOrganizationResponse[];

  constructor(loginInfo: TUserLoginAuthResponse) {
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
            active: uo.organization.active
          })
      );
  }
}
