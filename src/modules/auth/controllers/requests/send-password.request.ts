import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendResetPasswordRequest {
  @IsNotEmpty()
  @MaxLength(255)
  @IsString()
  @ApiProperty({ name: 'email' })
  email: string;
}
