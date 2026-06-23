import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsUUID,
  Max,
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
    description: 'Items to purchase. Max 5 distinct ticket types per order.',
    type: [CreateOrderItemRequest],
    example: [
      { ticketTypeId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', quantity: 2 }
    ]
  })
  items: CreateOrderItemRequest[];
}
