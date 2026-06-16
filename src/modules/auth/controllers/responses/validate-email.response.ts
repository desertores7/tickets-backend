import { ApiProperty } from '@nestjs/swagger';

export class ValidateEmailResponse {
  @ApiProperty()
  verified: boolean;

  @ApiProperty()
  alreadyVerified: boolean;

  @ApiProperty()
  message: string;

  constructor(verified: boolean, alreadyVerified: boolean, message: string) {
    this.verified = verified;
    this.alreadyVerified = alreadyVerified;
    this.message = message;
  }
}
