import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateSystemParameterRequest {
  @IsOptional()
  @IsString()
  @ApiProperty({
    name: 'value',
    example: '48',
    description: 'Nuevo valor del parámetro',
    required: false
  })
  value?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    name: 'description',
    example: 'Número de horas que deben pasar para que una conversación pendiente se marque como vencida',
    description: 'Nueva descripción del parámetro',
    required: false
  })
  description?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    name: 'type',
    example: 'number',
    description: 'Tipo del parámetro: string, number, boolean, json',
    required: false
  })
  type?: string;
}
