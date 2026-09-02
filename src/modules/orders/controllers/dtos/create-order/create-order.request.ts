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
}

export class CreateOrderRequest {
  @IsNotEmpty()
  @IsUUID()
  @ApiProperty({ description: 'Event UUID to purchase tickets for', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  eventUuid: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemRequest)
  @ApiProperty({
    description:
      'Items to purchase. Max 5 distinct ticket types per order, and at most 20 tickets in total across all items (BR-SALE-006) — el total lo valida el servicio.',
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
