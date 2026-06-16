import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshAuthRequest {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
