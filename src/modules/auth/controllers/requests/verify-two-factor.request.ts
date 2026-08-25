import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class VerifyTwoFactorRequest {
  @IsEmail()
  @ApiProperty({ description: 'Email usado en el login' })
  email: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'El código debe ser de 6 dígitos' })
  @ApiProperty({ description: 'Código de 6 dígitos enviado por email', example: '123456' })
  code: string;
}
