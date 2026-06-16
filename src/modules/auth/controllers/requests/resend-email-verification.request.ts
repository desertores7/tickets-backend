import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ResendEmailVerificationRequest {
  @IsNotEmpty()
  @IsEmail()
  @ApiProperty({ name: 'email' })
  email: string;
}
