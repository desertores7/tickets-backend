import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordRequest {
  @IsNotEmpty()
  @MaxLength(255)
  @IsString()
  @ApiProperty({ description: 'Email del usuario' })
  email: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  @Matches(/^\d{6}$/, { message: 'El código debe tener 6 dígitos' })
  @ApiProperty({ description: 'Código de 6 dígitos enviado por email', example: '123456' })
  code: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @MaxLength(255)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message: 'La contraseña debe incluir letras, números y al menos un carácter especial'
  })
  @ApiProperty({
    description: 'Nueva contraseña: letras, números y al menos un carácter especial (BR-AUTH-010)',
    minLength: 8
  })
  password: string;
}
