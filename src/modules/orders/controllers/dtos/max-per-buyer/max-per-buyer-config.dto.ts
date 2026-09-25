import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class UpdateMaxPerBuyerConfigRequest {
  @ApiProperty({
    example: 1_000_000,
    description: 'Precio (ARS) a partir del cual una entrada usa el tope alto de compra por comprador.'
  })
  @Type(() => Number)
  @IsInt({ message: 'El umbral de precio tiene que ser un número entero' })
  @Min(1, { message: 'El umbral de precio tiene que ser mayor a cero' })
  @Max(1_000_000_000, { message: 'El umbral de precio es demasiado alto' })
  priceThreshold: number;

  @ApiProperty({
    example: 1,
    description: 'Tope de compra por comprador para entradas que alcanzan el umbral de precio.'
  })
  @Type(() => Number)
  @IsInt({ message: 'El tope tiene que ser un número entero' })
  @Min(1, { message: 'El tope tiene que ser al menos 1' })
  @Max(1000, { message: 'El tope es demasiado alto' })
  highPriceLimit: number;

  @ApiProperty({
    example: 5,
    description: 'Tope de compra por comprador para entradas por debajo del umbral de precio.'
  })
  @Type(() => Number)
  @IsInt({ message: 'El tope tiene que ser un número entero' })
  @Min(1, { message: 'El tope tiene que ser al menos 1' })
  @Max(1000, { message: 'El tope es demasiado alto' })
  lowPriceLimit: number;
}

export class MaxPerBuyerConfigResponse {
  @ApiProperty({ example: 1_000_000, description: 'Umbral de precio (ARS).' })
  priceThreshold: number;

  @ApiProperty({ example: 1, description: 'Tope para entradas que alcanzan el umbral.' })
  highPriceLimit: number;

  @ApiProperty({ example: 5, description: 'Tope para entradas por debajo del umbral.' })
  lowPriceLimit: number;

  constructor(data: { priceThreshold: number; highPriceLimit: number; lowPriceLimit: number }) {
    this.priceThreshold = data.priceThreshold;
    this.highPriceLimit = data.highPriceLimit;
    this.lowPriceLimit = data.lowPriceLimit;
  }
}
