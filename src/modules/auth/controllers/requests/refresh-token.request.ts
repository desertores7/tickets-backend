import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, MinLength } from 'class-validator';

export class RefreshTokenRequest {
  @IsNotEmpty()
  @MinLength(1)
  @ApiProperty({
    name: 'refresh_token'
  })
  refresh_token: string;
}
