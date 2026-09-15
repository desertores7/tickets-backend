import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsBoolean, IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { DOCUMENT_TYPES } from '@modules/auth/const/document-type.const';

/** Alta de identidad post-Google (FC01): una sola vez; después queda bloqueado. */
export class CompleteDocumentRequest {
  @ApiProperty({ enum: DOCUMENT_TYPES })
  @IsString()
  @IsIn([...DOCUMENT_TYPES])
  documentType: (typeof DOCUMENT_TYPES)[number];

  @ApiProperty({ description: 'Número de documento (se persiste en user.dni)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  documentNumber: string;

  @ApiProperty({
    description: 'Debe ser true: aceptó TyC y declaró ser mayor de 18',
    default: true
  })
  @IsBoolean()
  @Equals(true, { message: 'Debés aceptar los términos y condiciones' })
  acceptedTerms: boolean;
}
