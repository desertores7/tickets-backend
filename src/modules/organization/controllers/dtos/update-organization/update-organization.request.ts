import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, MaxLength, MinLength } from 'class-validator';

/**
 * Sin constructor a proposito: `ValidationPipe` instancia este DTO con
 * `plainToInstance`, que llama `new` SIN argumentos y llena las propiedades
 * por asignacion. Un constructor con parametro obligatorio hace que el
 * endpoint devuelva 500 al leer una propiedad de `undefined`.
 */
export class UpdateOrganizationRequest {
  @IsNotEmpty()
  @MaxLength(50)
  @MinLength(4)
  @ApiProperty({
    name: 'name'
  })
  name: string;

}
