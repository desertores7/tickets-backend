import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateNotificationRequest {
  @IsUUID('4')
  @ApiProperty({
    description: 'UUID del usuario destinatario',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
  })
  userUuid: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  @ApiProperty({
    description: 'Título de la notificación',
    example: 'Prueba de notificación'
  })
  title: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(4000)
  @ApiProperty({
    name: 'body',
    description: 'Mensaje / cuerpo de la notificación',
    example: 'Si ves esto en el BO con sonido y globo, el poll funciona.'
  })
  body: string;
}
