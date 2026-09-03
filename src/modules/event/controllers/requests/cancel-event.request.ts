import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelEventRequest {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @ApiProperty({
    description: 'Motivo de cancelación (recomendado; se muestra a compradores)',
    required: false,
    nullable: true
  })
  reason?: string | null;
}
