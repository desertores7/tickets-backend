import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class TransferTicketRequest {
  @IsNotEmpty()
  @IsEmail()
  @ApiProperty({ description: 'Email del destinatario', example: 'amigo@ejemplo.com' })
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  @ApiPropertyOptional({ description: 'Mensaje opcional para el destinatario', example: '¡Nos vemos ahí!' })
  message?: string;
}
