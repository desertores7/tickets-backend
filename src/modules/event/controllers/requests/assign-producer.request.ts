import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class AssignProducerRequest {
  @IsNotEmpty()
  @IsUUID()
  @ApiProperty({
    description: 'UUID del usuario a asignar como productor de este evento',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
  })
  userUuid: string;
}
