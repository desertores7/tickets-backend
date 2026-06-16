import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenResponse {
  @ApiProperty({
    name: 'access_token'
  })
  access_token: string;

  @ApiProperty({
    name: 'refresh_token'
  })
  refresh_token: string;
}
