import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateFavoriteRequest {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  eventUuid: string;
}
