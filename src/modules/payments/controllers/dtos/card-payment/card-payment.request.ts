import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min
} from 'class-validator';

/**
 * Cobro con tarjeta — Checkout API.
 *
 * **Acá no viaja ningún dato de tarjeta.** El número, el vencimiento y el
 * código de seguridad los toma Mercado Pago en sus propios iframes y los
 * cambia por un `token` de un solo uso. Si alguna vez aparece un campo con el
 * número de tarjeta en este DTO, la integración pasa a estar dentro del alcance
 * PCI-DSS y hay que frenar.
 *
 * Sin constructor: `plainToInstance` instancia los request sin argumentos.
 */
export class CardPaymentRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @ApiProperty({
    description: 'Token de un solo uso generado por el SDK de Mercado Pago en el navegador.'
  })
  token: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @ApiProperty({ description: 'Medio de pago detectado por el bin.', example: 'visa' })
  paymentMethodId: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @ApiPropertyOptional({
    description: 'Banco emisor. Lo devuelve el SDK; puede no venir según el medio de pago.'
  })
  issuerId?: string;

  @IsInt()
  @Min(1)
  @Max(24)
  @ApiProperty({ description: 'Cuotas elegidas. Con Checkout API es obligatorio.', example: 1 })
  installments: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @ApiProperty({ description: 'Tipo de documento del titular.', example: 'DNI' })
  identificationType: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  @ApiProperty({
    description: 'Número de documento del titular. Obligatorio en Argentina.',
    example: '30123456'
  })
  identificationNumber: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @ApiPropertyOptional({
    description:
      'Huella del dispositivo (`MP_DEVICE_SESSION_ID`), del SDK de Mercado Pago. Mejora la ' +
      'tasa de aprobación. Opcional: si el script no cargó, el cobro igual se intenta.'
  })
  deviceId?: string;
}
