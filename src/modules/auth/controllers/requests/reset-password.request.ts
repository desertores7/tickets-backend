import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordRequest {
  @IsNotEmpty()
  @MaxLength(255)
  @IsString()
  @ApiProperty({ description: 'Email del usuario' })
  email: string;

  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(255)
  @IsString()
  @ApiProperty({ description: 'Nueva contraseña' })
  password: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({ description: 'Token recibido en el enlace del correo (/new-password?token=...)' })
  token: string;
}
