import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class SuspendOrganizationRequest {
  @ApiProperty({
    description:
      'Motivo de la suspensión. Queda registrado para el equipo interno; **nunca** se le muestra al público (`BR-PROD-006`).',
    example: 'Reclamos reiterados de compradores sin respuesta de la productora'
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
