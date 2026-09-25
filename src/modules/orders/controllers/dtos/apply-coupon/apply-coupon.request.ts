import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ApplyOrderCouponRequest {
  @IsNotEmpty({ message: 'Ingresá un código de cupón' })
  @IsString()
  @MaxLength(40)
  @ApiProperty({ description: 'Código del cupón (sin distinguir mayúsculas)', example: 'SHOWPASS10' })
  code: string;
}
