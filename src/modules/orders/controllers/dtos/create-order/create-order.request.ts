import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested
} from 'class-validator';

export class CreateOrderItemRequest {
  @IsNotEmpty()
  @IsUUID()
  @ApiProperty({ description: 'Ticket type UUID', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  ticketTypeId: string;

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  @Max(10)
  @ApiProperty({ description: 'Quantity to purchase (1–10)', example: 2, minimum: 1, maximum: 10 })
  quantity: number;

  @IsOptional()
  @IsUUID()
  @ApiPropertyOptional({
    description:
      'Unidad del mapa elegida (mesa, palco, box) — BR-SALE-010. Obligatoria si la tanda se vende por persona o como unidad completa. ' +
      'En unidad completa quantity es 1 (una mesa por línea); por persona, la cantidad de lugares.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
  })
  sectorUuid?: string;
}

export class CreateOrderRequest {
  @IsNotEmpty()
  @IsUUID()
  @ApiProperty({ description: 'Event UUID to purchase tickets for', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  eventUuid: string;

  @IsArray()
  @ArrayMinSize(1)
  // Cada unidad del mapa es una línea: 20 mesas son 20 líneas. El límite de
  // tandas distintas (5) y de entradas (BR-SALE-006) lo valida el servicio.
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemRequest)
  @ApiProperty({
    description:
      'Items to purchase. Max 20 lines, 5 distinct ticket types per order, and at most 20 tickets in total across all items (BR-SALE-006) — lo valida el servicio. Con unidades del mapa, una línea por unidad.',
    type: [CreateOrderItemRequest],
    example: [
      { ticketTypeId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', quantity: 2 }
    ]
  })
  items: CreateOrderItemRequest[];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @ApiPropertyOptional({
    description:
      'Código de cupón. El descuento se aplica sobre el subtotal y el costo de servicio se ' +
      'calcula después, sobre el subtotal ya descontado (BR-COUPON-008).',
    example: 'EARLY20'
  })
  couponCode?: string;
}
