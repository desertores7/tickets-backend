import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Sin constructor a proposito: `ValidationPipe` instancia este DTO con
 * `plainToInstance`, que llama `new` SIN argumentos y llena las propiedades
 * por asignacion. Un constructor con parametro obligatorio hace que el
 * endpoint devuelva 500 al leer una propiedad de `undefined`.
 */
export class CreateOrganizationRequest {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  @ApiProperty({
    name: 'name',
    description: 'Name of the organization'
  })
  name: string;

}
