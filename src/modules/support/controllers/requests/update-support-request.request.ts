import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  SUPPORT_REQUEST_STATUSES,
  SupportRequestStatus
} from '@config/db/entities/system/support_request.entity';

/**
 * Lo único que el Admin cambia de una consulta (`33` §16).
 *
 * El mensaje y quién lo escribió no se tocan: son lo que entró.
 *
 * Sin constructor: `plainToInstance` instancia los request sin argumentos.
 */
export class UpdateSupportRequestRequest {
  @IsOptional()
  @IsIn([...SUPPORT_REQUEST_STATUSES])
  @ApiPropertyOptional({ enum: SUPPORT_REQUEST_STATUSES })
  status?: SupportRequestStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @ApiPropertyOptional({
    description: 'Notas del equipo. Nunca se le muestran a quien escribió. Vacío las borra.',
    maxLength: 2000
  })
  internalNotes?: string;
}
