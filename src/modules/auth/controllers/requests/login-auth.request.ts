import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, MinLength } from 'class-validator';

export class LoginAuthRequest {
  @IsNotEmpty()
  @MinLength(1)
  @ApiProperty({
    name: 'email',
    default: ''
  })
  email: string;

  @IsNotEmpty()
  @MinLength(1)
  @ApiProperty({
    name: 'password',
    default: ''
  })
  password: string;
}
