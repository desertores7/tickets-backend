import { ApiProperty } from '@nestjs/swagger';

export class InitializePaymentResponse {
  @ApiProperty({ description: 'URL de checkout de la pasarela de pago', example: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=...' })
  checkoutUrl: string;

  @ApiProperty({ description: 'ID de preferencia generado por la pasarela', example: '1234567890-abc12345-def6-7890-abcd-ef1234567890' })
  preferenceId: string;

  @ApiProperty({ description: 'Fecha y hora de expiración de la sesión de pago' })
  expiresAt: Date;

  constructor(data: { checkoutUrl: string; preferenceId: string; expiresAt: Date }) {
    this.checkoutUrl = data.checkoutUrl;
    this.preferenceId = data.preferenceId;
    this.expiresAt = data.expiresAt;
  }
}
