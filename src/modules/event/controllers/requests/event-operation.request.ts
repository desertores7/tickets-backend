import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Request de cancelación también vive en `cancel-event.request.ts` (MaxLength 1000).
 * Este archivo conserva el DTO de cierre/reapertura de venta traído desde main.
 */
export class CancelEventRequest {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
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
