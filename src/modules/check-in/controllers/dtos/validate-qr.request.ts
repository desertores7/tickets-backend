import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class ValidateQrRequest {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ description: 'Código QR del ticket a validar', example: 'a1b2c3d4e5f6...' })
  qrCode: string;

  @IsNotEmpty()
  @IsUUID()
  @ApiProperty({ description: 'UUID del evento en el que se realiza el check-in', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  eventId: string;

  @IsOptional()
  @IsObject()
  @ApiPropertyOptional({
    description: 'Información del dispositivo escaneador (modelo, OS, app version, etc.)',
    example: { device: 'iPhone 15', os: 'iOS 17.4', appVersion: '2.1.0' }
  })
  deviceInfo?: Record<string, unknown>;
}
