import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RequestBankChangeRequest {
  @ApiProperty({ description: 'Nombre del banco' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  bankName: string;

  @ApiProperty({ description: 'CBU (22 dígitos)' })
  @IsString()
  @MaxLength(30)
  cbu: string;

  @ApiProperty({ description: 'Alias CBU' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  bankAlias: string;
}
