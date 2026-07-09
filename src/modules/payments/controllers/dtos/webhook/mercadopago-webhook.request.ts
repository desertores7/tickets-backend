import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';

export class MercadoPagoWebhookDataDto {
  @IsOptional()
  @ApiPropertyOptional({ description: 'ID del recurso notificado', example: '123456789' })
  id?: string | number;
}

/**
 * Body de las notificaciones de MercadoPago. Intencionalmente permisivo:
 * MP envía formatos distintos según el tipo de notificación (webhook moderno
 * con `type`/`data.id`, IPN legacy con `topic`/`resource`) y algunos campos
 * llegan como número o string según el caso. Un webhook nunca debe rebotar
 * con 400 por validación de schema — la verdad se obtiene siempre
 * re-consultando la API de MP con el payment id.
 */
export class MercadoPagoWebhookRequest {
  @IsOptional()
  @ApiPropertyOptional({ description: 'ID de la notificación', example: '123456789' })
  id?: string | number;

  @IsOptional()
  @ApiPropertyOptional({
    description: 'Tipo de evento (formato webhook)',
    example: 'payment',
    enum: ['payment', 'plan', 'subscription', 'invoice', 'point_integration_wh']
  })
  type?: string;

  @IsOptional()
  @ApiPropertyOptional({ description: 'Tipo de evento (formato IPN legacy)', example: 'payment' })
  topic?: string;

  @IsOptional()
  @ApiPropertyOptional({
    description: 'URL o ID del recurso (formato IPN legacy)',
    example: 'https://api.mercadolibre.com/merchant_orders/123456'
  })
  resource?: string;

  @IsOptional()
  @ApiPropertyOptional({ description: 'Acción del evento', example: 'payment.updated' })
  action?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MercadoPagoWebhookDataDto)
  @ApiPropertyOptional({ type: MercadoPagoWebhookDataDto })
  data?: MercadoPagoWebhookDataDto;
}
