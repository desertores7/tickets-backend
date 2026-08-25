import { Swagger } from '@root/shared/decorators/swagger.decorator';
import { Body, Controller, Get, HttpCode, Inject, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserAuth } from '@root/shared/auth/decorator/user-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import { IAuthService, TLoginAuthResult } from '../services/contracts/iauth.service';
import { LoginAuthResponse } from './responses/login-auth.response';
import { MeResponse } from './responses/me.response';
import { LoginAuthRequest } from './requests/login-auth.request';
import { UpdateMeRequest } from './requests/update-me.request';
import { ResetPasswordRequest } from './requests/reset-password.request';
import { SendResetPasswordRequest } from './requests/send-password.request';
import { ChangePasswordRequest } from './requests/change-password.request';
import { RefreshTokenRequest } from './requests/refresh-token.request';
import { RefreshTokenResponse } from './responses/refresh-token.response';
import { RegisterAuthRequest } from './requests/register-auth.request';
import { RegisterProducerRequest } from './requests/register-producer.request';
import { RegisterAuthResponse } from './responses/register-auth.response';
import { ValidateEmailRequest } from './requests/validate-email.request';
import { ValidateEmailResponse } from './responses/validate-email.response';
import { ResendEmailVerificationRequest } from './requests/resend-email-verification.request';
import { VerifyTwoFactorRequest } from './requests/verify-two-factor.request';
import { ResendTwoFactorRequest } from './requests/resend-two-factor.request';
import { CONTENT_TYPE } from '@root/shared/const/content-type.contant';

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(@Inject('IAuthService') public authService: IAuthService) {}

  private toLoginAuthResponse(result: TLoginAuthResult): LoginAuthResponse {
    return new LoginAuthResponse(result);
  }

  @ApiOperation({
    summary: 'Get authenticated user profile',
    description: 'Returns the current user profile with role and organizations using the JWT token.'
  })
  @UserAuth(null, MeResponse)
  @Get('me')
  async getMe(@User() userId: string): Promise<MeResponse> {
    const result = await this.authService.getMe(userId);
    return new MeResponse(result);
  }

  @ApiOperation({
    summary: 'Update authenticated user profile',
    description:
      'Partial update of the current user profile (name, phone, gender, address, billing, 2FA flag, image). ' +
      'Email and document fields cannot be changed here (BR-AUTH-008) — contact support.'
  })
  @UserAuth(UpdateMeRequest, MeResponse, 'multipart/form-data')
  @Patch('me')
  @UseInterceptors(FileInterceptor('imgProfile'))
  async updateMe(
    @User() userId: string,
    @Body() request: UpdateMeRequest,
    @UploadedFile() file?: Express.Multer.File
  ): Promise<MeResponse> {
    const result = await this.authService.updateMe(userId, { ...request, imgProfile: file });
    return new MeResponse(result);
  }

  @ApiOperation({
    summary: 'Deactivate own account',
    description:
      'Sets the authenticated user as inactive and invalidates all token sessions. ' +
      'Subsequent logins are rejected with “Usuario inactivo”.'
  })
  @UserAuth(null, null)
  @HttpCode(200)
  @Post('deactivate')
  async deactivateAccount(@User() userId: string): Promise<{ message: string }> {
    await this.authService.deactivateAccount(userId);
    return { message: 'Cuenta desactivada' };
  }

  @ApiOperation({
    summary: 'Login',
    description:
      'Validate credentials. If 2FA is enabled, returns `{ requiresTwoFactor: true, email }` and sends a 6-digit code by email. ' +
      'Otherwise returns JWT access and refresh tokens plus user data.'
  })
  @Swagger(LoginAuthRequest, LoginAuthResponse, CONTENT_TYPE.FORM_URLENCODED)
  @HttpCode(200)
  @Post('login')
  async loginAuth(@Body() request: LoginAuthRequest): Promise<LoginAuthResponse> {
    const result = await this.authService.userLoginAuth(request.email, request.password);
    return this.toLoginAuthResponse(result);
  }

  @ApiOperation({
    summary: 'Refresh tokens',
    description:
      'Exchanges a valid refresh token for a new access + refresh pair (rotation). ' +
      'Access tokens are short-lived (~15m); refresh lasts ~12h for web sessions.'
  })
  @Swagger(RefreshTokenRequest, RefreshTokenResponse)
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Body() request: RefreshTokenRequest): Promise<RefreshTokenResponse> {
    const tokens = await this.authService.refreshTokens(request.refresh_token);
    return Object.assign(new RefreshTokenResponse(), tokens);
  }

  @ApiOperation({
    summary: 'Verify 2FA code',
    description: 'Completes login after email/password when twoAuthentication is enabled. Consumes the 6-digit code from email.'
  })
  @Swagger(VerifyTwoFactorRequest, LoginAuthResponse)
  @HttpCode(200)
  @Post('verify')
  async verifyTwoFactor(@Body() request: VerifyTwoFactorRequest): Promise<LoginAuthResponse> {
    const result = await this.authService.verifyTwoFactor(request.email, request.code);
    return this.toLoginAuthResponse(result);
  }

  @ApiOperation({
    summary: 'Resend 2FA code',
    description: 'Resends a new 6-digit login code. Always returns 200 to avoid email enumeration.'
  })
  @Swagger(ResendTwoFactorRequest, null)
  @HttpCode(200)
  @Post('resend')
  async resendTwoFactor(@Body() request: ResendTwoFactorRequest): Promise<{ message: string }> {
    return this.authService.resendTwoFactor(request.email);
  }

  @ApiOperation({
    summary: 'Send reset password email',
    description:
      'Sends a 6-digit code by email so the user can set a new password on /reset-password.\n\n' +
      '**Always returns 200**, whether or not the address belongs to an account. Answering ' +
      'differently would turn this public endpoint into an oracle for discovering which ' +
      'email addresses are registered.'
  })
  @Swagger(SendResetPasswordRequest, null)
  @HttpCode(200)
  @Post('send-reset-password')
  async sendResetPassword(@Body() request: SendResetPasswordRequest): Promise<{ message: string }> {
    await this.authService.sendResetPassword(request.email);
    return { message: 'Si el correo está registrado, te enviamos un código para recuperar tu contraseña.' };
  }

  @ApiOperation({
    summary: 'Change own password',
    description:
      'Changes the authenticated user password. Requires the current password: without that ' +
      'check a stolen token would be enough to take over the account.'
  })
  @UserAuth(ChangePasswordRequest, null)
  @HttpCode(200)
  @Post('change-password')
  async changePassword(@Body() request: ChangePasswordRequest, @User() userId: string): Promise<void> {
    await this.authService.changePassword(userId, request.currentPassword, request.newPassword);
  }

  @ApiOperation({
    summary: 'Reset password',
    description:
      'Sets a new password using the 6-digit code from the reset email, plus email and the new password.'
  })
  @Swagger(ResetPasswordRequest, null)
  @HttpCode(200)
  @Post('reset-password')
  async resetPassword(@Body() request: ResetPasswordRequest): Promise<void> {
    await this.authService.resetPassword(request.email, request.password, request.code);
  }

  @ApiOperation({
    summary: 'Register client',
    description: 'Creates a client account and sends a validation email with a link to /validate-email.'
  })
  @Swagger(RegisterAuthRequest, RegisterAuthResponse)
  @HttpCode(201)
  @Post('register/client')
  async registerClient(@Body() request: RegisterAuthRequest): Promise<RegisterAuthResponse> {
    const result = await this.authService.registerAuth(request);
    return new RegisterAuthResponse(result.email);
  }

  @ApiOperation({
    summary: 'Register producer',
    description:
      'Creates a Productor account with a draft organization (validationStatus=draft_incomplete). ' +
      'Sends email verification. Fiscal wizard is required before creating events (FP01).'
  })
  @Swagger(RegisterProducerRequest, RegisterAuthResponse)
  @HttpCode(201)
  @Post('register/producer')
  async registerProducer(@Body() request: RegisterProducerRequest): Promise<RegisterAuthResponse> {
    const result = await this.authService.registerProducer({
      firstName: request.firstName,
      lastName: request.lastName,
      email: request.email,
      password: request.password,
      acceptedTerms: true
    });
    return new RegisterAuthResponse(result.email);
  }

  @ApiOperation({
    summary: 'Resend email verification',
    description:
      'Resends the registration validation email with a new link to /validate-email for users who have not verified their email yet.'
  })
  @Swagger(ResendEmailVerificationRequest, null)
  @HttpCode(200)
  @Post('register/resend-email-verification')
  async resendEmailVerification(@Body() request: ResendEmailVerificationRequest): Promise<void> {
    await this.authService.resendEmailVerification(request.email);
  }

  @ApiOperation({
    summary: 'Validate email',
    description:
      'Validates the user email using the token from the registration email link. Returns whether it was verified, already verified, or invalid.'
  })
  @Swagger(ValidateEmailRequest, ValidateEmailResponse)
  @HttpCode(200)
  @Post('validate-email')
  async validateEmail(@Body() request: ValidateEmailRequest): Promise<ValidateEmailResponse> {
    const result = await this.authService.validateEmailAuth(request.token);
    return new ValidateEmailResponse(result.verified, result.alreadyVerified, result.message);
  }
}
