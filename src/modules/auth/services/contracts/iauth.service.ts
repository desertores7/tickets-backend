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

/** Login completo o challenge 2FA (BR-AUTH-011) */
export type TLoginAuthResult =
  | { requiresTwoFactor: true; email: string }
  | (TUserLoginAuthResponse & { requiresTwoFactor?: false });

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
  username?: string;
  phone?: string;
  gender?: string | null;
  birthday?: string;
  address?: string | null;
  billingIdType?: string | null;
  billingIdNumber?: string | null;
  billingLegalName?: string | null;
  billingVatCondition?: string | null;
  billingFiscalAddress?: string | null;
  billingEmail?: string | null;
  twoAuthentication?: boolean;
  imgProfile?: Express.Multer.File;
}

export interface IAuthService {
  userLoginAuth(email: string, password: string): Promise<TLoginAuthResult>;
  verifyTwoFactor(email: string, code: string): Promise<TUserLoginAuthResponse>;
  resendTwoFactor(email: string): Promise<{ message: string }>;
  registerAuth(request: RegisterAuthRequest): Promise<{ email: string; uuid: string }>;
  registerProducer(request: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    acceptedTerms: true;
  }): Promise<{ email: string; uuid: string; organizationUuid: string }>;
  resendEmailVerification(email: string): Promise<void>;
  validateEmailAuth(token: string): Promise<{ verified: boolean; alreadyVerified: boolean; message: string }>;
  sendResetPassword(email: string): Promise<void>;
  resetPassword(email: string, password: string, code: string): Promise<void>;
  refreshTokens(refreshToken: string): Promise<{ access_token: string; refresh_token: string }>;
  changePassword(userUuid: string, currentPassword: string, newPassword: string): Promise<void>;
  createTokenSession(
    userId: string,
    accessToken: string,
    refreshToken: string,
    queryRunner?: QueryRunner
  ): Promise<void>;
  getMe(userUuid: string): Promise<TMeResponse>;
  updateMe(authenticatedUserUuid: string, data: IUpdateMeData): Promise<TMeResponse>;
  deactivateAccount(userUuid: string): Promise<void>;
  validateProducerInvite(token: string): Promise<{
    valid: boolean;
    emailMasked?: string;
    organizationName?: string;
    expiresAt?: string;
    message?: string;
  }>;
  acceptProducerInvite(request: {
    token: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }): Promise<{ message: string; email: string }>;
}
