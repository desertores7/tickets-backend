import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Extensión excepcional del plazo de reembolso (`BR-REFUND-010`).
 *
 * Sin constructor: `plainToInstance` instancia los request sin argumentos.
 */
export class ExtendRefundWindowRequest {
  @Type(() => Date)
  @IsDate()
  @ApiProperty({
    description:
      'Hasta cuándo se puede pedir el reembolso. ISO-8601. Solo hacia adelante: tiene que ser ' +
      'posterior al plazo vigente, que por defecto es el inicio del evento.',
    example: '2026-10-20T23:59:59.000Z'
  })
  extendedTo: Date;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @ApiProperty({
    description:
      'Por qué se extiende. Obligatorio: es una decisión sobre dinero de terceros y queda ' +
      'auditada en el historial del evento.',
    example: 'Cancelación avisada 40 minutos antes del show, acordado con la productora'
  })
  reason: string;
}
