import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ValidateCodeLoginRequest {
  @IsNotEmpty()
  @MaxLength(255)
  @IsString()
  @ApiProperty({ name: 'email' })
  email: string;

  @IsNotEmpty()
  @MaxLength(6)
  @IsString()
  @ApiProperty({ name: 'code' })
  code: string;
}
