import { ApiProperty } from '@nestjs/swagger';

export class RegisterAuthResponse {
  @ApiProperty()
  message: string;

  @ApiProperty()
  email: string;

  constructor(email: string) {
    this.message = 'Registro exitoso. Revisa tu correo para validar tu cuenta.';
    this.email = email;
  }
}
