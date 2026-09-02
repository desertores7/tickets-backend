import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID, ValidateNested } from 'class-validator';

import { CreateTicketTypeRequest } from './create-ticket-type.request';
import { UpdateTicketTypeRequest } from './update-ticket-type.request';

/** Tope por lote: un mapa grande carga decenas de tandas, no miles. */
const MAX_ITEMS = 200;

export class BulkCreateTicketTypesRequest {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => CreateTicketTypeRequest)
  @ApiProperty({ description: 'Ticket types to create', type: [CreateTicketTypeRequest] })
  items: CreateTicketTypeRequest[];
}

export class BulkDeleteTicketTypesRequest {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_ITEMS)
  @IsUUID('all', { each: true })
  @ApiProperty({ description: 'Ticket type UUIDs to deactivate', type: [String] })
  uuids: string[];
}

export class BulkUpdateTicketTypeItem extends UpdateTicketTypeRequest {
  @IsUUID()
  @ApiProperty({ description: 'Ticket type UUID to update' })
  uuid: string;
}

export class BulkUpdateTicketTypesRequest {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => BulkUpdateTicketTypeItem)
  @ApiProperty({ description: 'Ticket types to update', type: [BulkUpdateTicketTypeItem] })
  items: BulkUpdateTicketTypeItem[];
}
