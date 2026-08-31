import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber } from 'class-validator';

/**
 * Sin constructor a proposito: `ValidationPipe` instancia este DTO con
 * `plainToInstance`, que llama `new` SIN argumentos y llena las propiedades
 * por asignacion. Un constructor con parametro obligatorio hace que el
 * endpoint devuelva 500 al leer una propiedad de `undefined`.
 */
export class UpdateUserFileRequest {
  @IsNotEmpty()
  @IsNumber()
  @ApiProperty({
    name: 'path'
  })
  path: string;

}
