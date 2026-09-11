import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

/** Canje del ticket de un solo uso que deja el callback de Google. */
export class GoogleExchangeRequest {
  @ApiProperty({
    description: 'Ticket devuelto por el callback de Google en el query string.',
    example: '9f1c2b84-3a6d-4f51-9c77-0b2e5d8a41c3'
  })
  @IsString()
  @Length(10, 100)
  ticket: string;
}
