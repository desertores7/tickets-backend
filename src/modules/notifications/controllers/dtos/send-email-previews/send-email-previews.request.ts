import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class SendEmailPreviewsRequest {
  @IsEmail()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Casilla a la que se mandan todas las previsualizaciones (con datos ficticios).',
    example: 'nombre@gmail.com'
  })
  email: string;
}
