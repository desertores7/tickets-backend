import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangePasswordRequest {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ description: 'Contraseña actual, para confirmar identidad' })
  currentPassword: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  @ApiProperty({ description: 'Nueva contraseña (mínimo 6 caracteres)' })
  newPassword: string;
}
