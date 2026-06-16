import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSystemParameterRequest {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    name: 'key',
    example: 'conversation.expired.minutes',
    description: 'Clave única del parámetro'
  })
  key: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    name: 'value',
    example: '1440',
    description: 'Valor del parámetro'
  })
  value: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    name: 'description',
    example: 'Número de horas que deben pasar para que una conversación pendiente se marque como vencida',
    description: 'Descripción del parámetro',
    required: false
  })
  description?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    name: 'type',
    example: 'number',
    description: 'Tipo del parámetro: string, number, boolean, json',
    required: false,
    default: 'string'
  })
  type?: string;
}
