import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ResendTwoFactorRequest {
  @IsEmail()
  @ApiProperty({ description: 'Email usado en el login (reenvía código 2FA)' })
  email: string;
}
