import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsBoolean, IsEmail, IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

/** Alta liviana de Productor (FP01) — sin documento ni datos fiscales. */
export class RegisterProducerRequest {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  lastName: string;

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
