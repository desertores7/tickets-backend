import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { IAssignUserOrganization } from '@modules/organization/services/core/organization';
import { DOCUMENT_TYPES } from '@modules/auth/const/document-type.const';

/**
 * Sin constructor a proposito: `ValidationPipe` instancia este DTO con
 * `plainToInstance`, que llama `new` SIN argumentos y llena las propiedades
 * por asignacion. Un constructor con parametro obligatorio hace que el
 * endpoint devuelva 500 al leer una propiedad de `undefined`.
 */
export class AssignUserOrganizationRequest implements IAssignUserOrganization {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'User first name'
  })
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'User last name'
  })
  lastName: string;

  @IsString()
  @IsIn([...DOCUMENT_TYPES])
  @ApiProperty({
    description: 'Document type',
    enum: DOCUMENT_TYPES
  })
  documentType: (typeof DOCUMENT_TYPES)[number];

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  @ApiProperty({
    description: 'Document number'
  })
  documentNumber: string;

  @IsEmail()
  @ApiProperty({
    description: 'User email'
  })
  email: string;

  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message: 'La contraseña debe incluir letras, números y al menos un carácter especial'
  })
  @ApiProperty({
    description: 'User password'
  })
  password: string;

}
