import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class ChangePasswordRequest {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ description: 'Contraseña actual, para confirmar identidad' })
  currentPassword: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message: 'La contraseña debe incluir letras, números y al menos un carácter especial'
  })
  @ApiProperty({
    description: 'Nueva contraseña: letras, números y al menos un carácter especial (BR-AUTH-010)',
    minLength: 8
  })
  newPassword: string;
}
