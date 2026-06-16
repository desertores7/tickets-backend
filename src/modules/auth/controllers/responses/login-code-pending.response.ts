import { ApiProperty } from '@nestjs/swagger';

export class LoginCodePendingResponse {
  @ApiProperty({ name: 'requiresCode', example: true })
  requiresCode: boolean;

  @ApiProperty({ name: 'message', example: 'Login code sent successfully' })
  message: string;

  constructor() {
    this.requiresCode = true;
    this.message = 'Login code sent successfully';
  }
}
