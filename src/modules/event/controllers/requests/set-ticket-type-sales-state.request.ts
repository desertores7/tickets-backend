import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetTicketTypeSalesStateRequest {
  @ApiProperty({
    description: 'Habilita o pausa manualmente la venta sin eliminar la tanda.'
  })
  @IsBoolean()
  enabled: boolean;
}
