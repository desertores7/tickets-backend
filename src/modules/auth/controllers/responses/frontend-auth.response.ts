import { ApiProperty } from '@nestjs/swagger';
import { TUserLoginAuthResponse } from '@modules/auth/services/contracts/iauth.service';

export class FrontendAuthUserResponse {
  @ApiProperty()
  id: string;

  @ApiProperty()
  fullName: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  role: string;

  @ApiProperty()
  clinicId: string;

  @ApiProperty()
  clinicName: string;

  constructor(user: TUserLoginAuthResponse, clinicId?: string, clinicName?: string) {
    this.id = user.uuid;
    this.fullName = `${user.firstName} ${user.lastName}`.trim();
    this.email = user.email;
    this.role = user.userRoles?.[0]?.role?.name ?? 'clinic_admin';
    this.clinicId = clinicId ?? '';
    this.clinicName = clinicName ?? '';
  }
}

export class FrontendAuthResponse {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty()
  expiresIn: number;

  @ApiProperty({ type: FrontendAuthUserResponse })
  user: FrontendAuthUserResponse;

  constructor(loginInfo: TUserLoginAuthResponse, clinicId?: string, clinicName?: string, expiresIn = 3600) {
    this.accessToken = loginInfo.access_token;
    this.refreshToken = loginInfo.refresh_token;
    this.expiresIn = expiresIn;
    this.user = new FrontendAuthUserResponse(loginInfo, clinicId, clinicName);
  }
}

export class RefreshAuthResponse {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty()
  expiresIn: number;

  constructor(tokens: { access_token: string; refresh_token: string }, expiresIn = 3600) {
    this.accessToken = tokens.access_token;
    this.refreshToken = tokens.refresh_token;
    this.expiresIn = expiresIn;
  }
}

export class ForgotPasswordResponse {
  @ApiProperty()
  message: string;

  constructor(message = 'If the email exists, a reset link was sent.') {
    this.message = message;
  }
}
