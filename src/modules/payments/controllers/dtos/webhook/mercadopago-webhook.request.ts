import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsString, ValidateNested } from 'class-validator';

export class MercadoPagoWebhookDataDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ description: 'ID del recurso notificado', example: '123456789' })
  id: string;
}

export class MercadoPagoWebhookRequest {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ description: 'ID de la notificación', example: '123456789' })
  id: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    description: 'Tipo de evento notificado',
    example: 'payment',
    enum: ['payment', 'plan', 'subscription', 'invoice', 'point_integration_wh']
  })
  type: string;

  @ValidateNested()
  @Type(() => MercadoPagoWebhookDataDto)
  @ApiProperty({ type: MercadoPagoWebhookDataDto })
  data: MercadoPagoWebhookDataDto;
}
