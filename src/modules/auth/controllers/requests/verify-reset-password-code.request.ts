import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Length, Matches } from 'class-validator';

/** Verifica el código de recupero sin consumirlo (el reset lo marca usado). */
export class VerifyResetPasswordCodeRequest {
  @IsEmail()
  @ApiProperty({ description: 'Email al que se envió el código' })
  email: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'El código debe ser de 6 dígitos' })
  @ApiProperty({ description: 'Código de 6 dígitos enviado por email', example: '123456' })
  code: string;
}
