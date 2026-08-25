import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export const SUPPORT_CONTACT_TYPES = [
  'problema_compra',
  'no_recibi_entrada',
  'consulta_evento',
  'otro'
] as const;

export type SupportContactType = (typeof SUPPORT_CONTACT_TYPES)[number];

export class SupportContactRequest {
  @ApiProperty({ enum: SUPPORT_CONTACT_TYPES })
  @IsIn([...SUPPORT_CONTACT_TYPES])
  type: SupportContactType;

  @ApiProperty({ minLength: 10, maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(2000)
  message: string;

  @ApiProperty({ description: 'Email de contacto (prellenado desde la sesión)' })
  @IsEmail()
  email: string;
}
