import { Swagger } from '@root/shared/decorators/swagger.decorator';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserAuth } from '@root/shared/auth/decorator/user-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import { IAuthService, TUserLoginAuthResponse } from '../services/contracts/iauth.service';
import { LoginAuthResponse } from './responses/login-auth.response';
import { MeResponse } from './responses/me.response';
import { LoginAuthRequest } from './requests/login-auth.request';
import { UpdateMeRequest } from './requests/update-me.request';
import { ResetPasswordRequest } from './requests/reset-password.request';
import { SendResetPasswordRequest } from './requests/send-password.request';
import { LoginCodePendingResponse } from './responses/login-code-pending.response';
import { ValidateCodeLoginRequest } from './requests/validate-code-login.request';
import { ConfigService } from '@nestjs/config';
import { RegisterAuthRequest } from './requests/register-auth.request';
import { RegisterAuthResponse } from './responses/register-auth.response';
import { ValidateEmailRequest } from './requests/validate-email.request';
import { ValidateEmailResponse } from './responses/validate-email.response';
import { ResendEmailVerificationRequest } from './requests/resend-email-verification.request';
import { CONTENT_TYPE } from '@root/shared/const/content-type.contant';

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    @Inject('IAuthService') public authService: IAuthService,
    private readonly configService: ConfigService
  ) {}

  private isLocalEnvironment(): boolean {
    const env = String(this.configService.get<string>('ENV') || '').toLowerCase();
    const nodeEnv = String(this.configService.get<string>('NODE_ENV') || '').toLowerCase();
    return env === 'local' || env === 'dev' || nodeEnv === 'development';
  }

  private toLoginAuthResponse(result: TUserLoginAuthResponse): LoginAuthResponse {
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
      'Partial update of the current user profile. Accepts profile fields, password, and an optional profile image (image/*, stored as webp).'
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
    summary: 'Login (send access code)',
    description:
      'Validate credentials and send a login code by email. In local/dev only, use header x-dev-login-bypass=true to skip the code step.'
  })
  @ApiHeader({
    name: 'x-dev-login-bypass',
    required: false,
    description:
      'Solo con ENV=local|dev o NODE_ENV=development. Envía true para omitir el código y recibir el JWT directamente.',
    schema: { type: 'string', enum: ['true', 'false'], default: 'true' }
  })
  @Swagger(LoginAuthRequest, LoginCodePendingResponse, CONTENT_TYPE.FORM_URLENCODED)
  @ApiResponse({
    status: 200,
    type: LoginAuthResponse,
    description: 'Local/dev con header x-dev-login-bypass=true. Misma respuesta que POST /auth/validate-code-login.'
  })
  @HttpCode(200)
  @Post('login')
  async loginAuth(
    @Body() request: LoginAuthRequest,
    @Headers('x-dev-login-bypass') devBypassHeader?: string
  ): Promise<LoginCodePendingResponse | LoginAuthResponse> {
    const devBypassRequested = String(devBypassHeader || '').toLowerCase() === 'true';
    if (devBypassRequested && this.isLocalEnvironment()) {
      const result = await this.authService.userLoginAuth(request.email, request.password);
      return this.toLoginAuthResponse(result);
    }

    await this.authService.startLoginCodeAuth(request.email, request.password);
    return new LoginCodePendingResponse();
  }

  @ApiOperation({
    summary: 'Validate login code',
    description: 'Validate email and code to complete login and return tokens plus user data.'
  })
  @Swagger(ValidateCodeLoginRequest, LoginAuthResponse, CONTENT_TYPE.FORM_URLENCODED)
  @HttpCode(200)
  @Post('validate-code-login')
  async validateCodeLogin(@Body() request: ValidateCodeLoginRequest): Promise<LoginAuthResponse> {
    const result = await this.authService.validateLoginCodeAuth(request.email, request.code);
    return this.toLoginAuthResponse(result);
  }

  @ApiOperation({
    summary: 'Send reset password email',
    description: 'Sends an email with a link to /new-password so the user can set a new password.'
  })
  @Swagger(SendResetPasswordRequest, null)
  @HttpCode(200)
  @Post('send-reset-password')
  async sendResetPassword(@Body() request: SendResetPasswordRequest): Promise<void> {
    await this.authService.sendResetPassword(request.email);
  }

  @ApiOperation({
    summary: 'Reset password',
    description:
      'Sets a new password using the token from the reset email link (/new-password?token=...) plus email and password.'
  })
  @Swagger(ResetPasswordRequest, null)
  @HttpCode(200)
  @Post('reset-password')
  async resetPassword(@Body() request: ResetPasswordRequest): Promise<void> {
    await this.authService.resetPassword(request.email, request.password, request.token);
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
