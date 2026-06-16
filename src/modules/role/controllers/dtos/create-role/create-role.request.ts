import { ApiProperty } from '@nestjs/swagger';
import { TEntityResponse } from '@config/db/meta/db.types';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateRoleRequest {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    name: 'name'
  })
  name: string;
}
