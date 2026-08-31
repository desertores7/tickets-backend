import { ApiProperty } from '@nestjs/swagger';
import { TEntityResponse } from '@config/db/meta/db.types';
import { IsArray, IsNotEmpty, IsString } from 'class-validator';

/**
 * Sin constructor a proposito: `ValidationPipe` instancia este DTO con
 * `plainToInstance`, que llama `new` SIN argumentos y llena las propiedades
 * por asignacion. Un constructor con parametro obligatorio hace que el
 * endpoint devuelva 500 al leer una propiedad de `undefined`.
 */
export class UnassignUserOrganizationRequest {
  @IsNotEmpty()
  @IsArray()
  @ApiProperty({
    name: 'userUuids',
    description: 'User uuids to unassign from the organization'
  })
  userUuids: string[];

}
