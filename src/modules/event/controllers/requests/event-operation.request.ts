import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** Sin constructor: `plainToInstance` instancia los request sin argumentos. */
export class CancelEventRequest {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ApiPropertyOptional({
    description:
      'Motivo de la cancelación. Recomendado (`29` §19): se le muestra al comprador en el aviso.',
    example: 'Suspendido por alerta meteorológica'
  })
  reason?: string;
}

export class SetSalesClosedRequest {
  @IsBoolean()
  @ApiProperty({
    description: 'true corta la venta, false la reabre. Un evento cancelado no se puede reabrir.'
  })
  closed: boolean;
}
