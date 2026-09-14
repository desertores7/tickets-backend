import { ApiProperty } from '@nestjs/swagger';
import { TUserLoginAuthResponse } from '@modules/auth/services/contracts/iauth.service';
import { LoginAuthResponse } from './login-auth.response';

/**
 * Verificación de email + sesión lista para entrar al panel
 * (mismo contrato de tokens que el login, sin pedir contraseña otra vez).
 */
export class ValidateEmailResponse extends LoginAuthResponse {
  @ApiProperty()
  verified: boolean;

  @ApiProperty()
  alreadyVerified: boolean;

  @ApiProperty()
  message: string;

  constructor(
    verified: boolean,
    alreadyVerified: boolean,
    message: string,
    session: TUserLoginAuthResponse
  ) {
    super(session);
    this.verified = verified;
    this.alreadyVerified = alreadyVerified;
    this.message = message;
  }
}
