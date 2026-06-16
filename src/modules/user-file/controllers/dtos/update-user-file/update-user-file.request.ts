import { ApiProperty } from '@nestjs/swagger';
import { TEntityResponse } from '@config/db/meta/db.types';
import { IsNotEmpty, IsNumber } from 'class-validator';

export class UpdateUserFileRequest {
  @IsNotEmpty()
  @IsNumber()
  @ApiProperty({
    name: 'path'
  })
  path: string;

  constructor(data: TEntityResponse<'file', undefined, undefined>) {
    this.path = data.path;
  }
}
