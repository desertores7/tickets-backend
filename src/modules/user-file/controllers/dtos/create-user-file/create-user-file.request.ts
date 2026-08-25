import { ApiProperty } from '@nestjs/swagger';
import { TEntityResponse } from '@config/db/meta/db.types';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateUserFileRequest {
  @IsNotEmpty()
  @IsNumber()
  @ApiProperty({
    name: 'userUuid'
  })
  userUuid: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    name: 'path'
  })
  path: string;

  constructor(data: TEntityResponse<'file', undefined, undefined>) {
    this.userUuid = data.userUuid ?? '';
    this.path = data.path ?? '';
  }
}
