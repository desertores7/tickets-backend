import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsBoolean, IsEmail, IsIn, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { DOCUMENT_TYPES } from '@modules/auth/const/document-type.const';

export class RegisterAuthRequest {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ enum: DOCUMENT_TYPES })
  @IsString()
  @IsIn([...DOCUMENT_TYPES])
  documentType: (typeof DOCUMENT_TYPES)[number];

  @ApiProperty({ description: 'Número de documento (se persiste en user.dni)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  documentNumber: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Letras, números y al menos un carácter especial (BR-AUTH-010)',
    minLength: 8
  })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message: 'La contraseña debe incluir letras, números y al menos un carácter especial'
  })
  password: string;

  @ApiProperty({
    description: 'Debe ser true: aceptó TyC y declaró ser mayor de 18',
    default: true
  })
  @IsBoolean()
  @Equals(true, { message: 'Debés aceptar los términos y condiciones' })
  acceptedTerms: boolean;
}
