import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

export class UpdateServiceFeeConfigRequest {
  @ApiProperty({
    example: 50000,
    description:
      'Tope del costo de servicio por entrada, en ARS. Si el 10% de una entrada lo supera, se cobra el tope.'
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El tope tiene que ser un número' })
  // Un tope en cero dejaría de cobrar el servicio en toda la plataforma: no es
  // algo que deba poder pasar por un error de tipeo.
  @Min(1, { message: 'El tope tiene que ser mayor a cero' })
  @Max(100_000_000, { message: 'El tope es demasiado alto' })
  cap: number;
}

export class ServiceFeeConfigResponse {
  @ApiProperty({ example: 0.1, description: 'Tasa por entrada (0.1 = 10%).' })
  rate: number;

  @ApiProperty({ example: 50000, description: 'Tope por entrada, en ARS.' })
  cap: number;

  constructor(data: { rate: number; cap: number }) {
    this.rate = data.rate;
    this.cap = data.cap;
  }
}
