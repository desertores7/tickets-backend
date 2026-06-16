import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ValidateEmailRequest {
  @ApiProperty({ description: 'Token de verificación recibido en el enlace del correo' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
