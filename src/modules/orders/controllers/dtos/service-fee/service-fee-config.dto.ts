import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

export class UpdateServiceFeeConfigRequest {
  @ApiProperty({
    example: 10,
    description: 'Porcentaje del costo de servicio sobre el valor de cada entrada (10 = 10%).'
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El porcentaje tiene que ser un número' })
  // En cero dejaría de cobrar el servicio en toda la plataforma: no es algo que
  // deba poder pasar por un error de tipeo.
  @Min(0.01, { message: 'El porcentaje tiene que ser mayor a cero' })
  @Max(50, { message: 'El porcentaje no puede superar el 50%' })
  ratePercent: number;

  @ApiProperty({
    example: 50000,
    description:
      'Tope del costo de servicio por entrada, en ARS. Si el porcentaje de una entrada lo supera, se cobra el tope.'
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El tope tiene que ser un número' })
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
