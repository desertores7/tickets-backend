import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class AcceptProducerInviteRequest {
  @ApiProperty()
  @IsString()
  token: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  lastName?: string;
}

export class ProducerInviteValidationResponse {
  @ApiProperty()
  valid: boolean;

  @ApiPropertyOptional()
  emailMasked?: string;

  @ApiPropertyOptional()
  organizationName?: string;

  @ApiPropertyOptional()
  expiresAt?: string;

  @ApiPropertyOptional()
  message?: string;

  constructor(data: {
    valid: boolean;
    emailMasked?: string;
    organizationName?: string;
    expiresAt?: string;
    message?: string;
  }) {
    this.valid = data.valid;
    this.emailMasked = data.emailMasked;
    this.organizationName = data.organizationName;
    this.expiresAt = data.expiresAt;
    this.message = data.message;
  }
}

export class AcceptProducerInviteResponse {
  @ApiProperty()
  message: string;

  @ApiProperty()
  email: string;

  constructor(message: string, email: string) {
    this.message = message;
    this.email = email;
  }
}
