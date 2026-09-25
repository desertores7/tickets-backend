import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsUUID } from 'class-validator';

export class InviteProducerStaffRequest {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ enum: ['producer', 'validator', 'cashier'], default: 'producer' })
  @IsOptional()
  @IsIn(['producer', 'validator', 'cashier'])
  role?: 'producer' | 'validator' | 'cashier';

  @ApiPropertyOptional({
    description:
      'Evento al que queda asignado al aceptar la invitación. Solo para `validator` o `cashier`.'
  })
  @IsOptional()
  @IsUUID()
  eventUuid?: string;
}
