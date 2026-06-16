import { TEntityResponse } from '@config/db/meta/db.types';
import { RegisterAuthRequest } from '@modules/auth/controllers/requests/register-auth.request';
import { IUserTokenSession } from '@modules/user/services/core/user';
import { QueryRunner } from 'typeorm';

export type TUserLoginAuthResponse = TEntityResponse<
  'user',
  {
    files: true;
    userTokenSessions: true;
    userRoles: { role: true };
    userOrganizations: { organization: true };
  },
  undefined
> &
  IUserTokenSession & { imgProfile: object; roleUuid?: string; role?: string };

export type TMeResponse = TEntityResponse<
  'user',
  {
    files: true;
    userRoles: { role: true };
    userOrganizations: { organization: true };
  },
  undefined
>;

export interface IUpdateMeData {
  firstName?: string;
  lastName?: string;
  email?: string;
  username?: string;
  phone?: string;
  dni?: string;
  gender?: string;
  birthday?: string;
  password?: string;
  imgProfile?: Express.Multer.File;
}

export interface IAuthService {
  startLoginCodeAuth(email: string, password: string): Promise<void>;
  validateLoginCodeAuth(emailOrUsername: string, code: string): Promise<TUserLoginAuthResponse>;
  userLoginAuth(email: string, password: string): Promise<TUserLoginAuthResponse>;
  registerAuth(request: RegisterAuthRequest): Promise<{ email: string; uuid: string }>;
  resendEmailVerification(email: string): Promise<void>;
  validateEmailAuth(token: string): Promise<{ verified: boolean; alreadyVerified: boolean; message: string }>;
  sendResetPassword(email: string): Promise<void>;
  resetPassword(email: string, password: string, token: string): Promise<void>;
  createTokenSession(
    userId: string,
    accessToken: string,
    refreshToken: string,
    queryRunner?: QueryRunner
  ): Promise<void>;
  getMe(userUuid: string): Promise<TMeResponse>;
  updateMe(authenticatedUserUuid: string, data: IUpdateMeData): Promise<TMeResponse>;
}
