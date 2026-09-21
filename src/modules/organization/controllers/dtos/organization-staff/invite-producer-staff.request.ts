import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional } from 'class-validator';

export class InviteProducerStaffRequest {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ enum: ['producer', 'validator', 'cashier'], default: 'producer' })
  @IsOptional()
  @IsIn(['producer', 'validator', 'cashier'])
  role?: 'producer' | 'validator' | 'cashier';
}
