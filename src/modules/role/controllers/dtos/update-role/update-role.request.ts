import { ApiProperty } from '@nestjs/swagger';
import { TEntityResponse } from '@config/db/meta/db.types';
import { IsNotEmpty, MaxLength, MinLength } from 'class-validator';

export class UpdateRoleRequest {
  @IsNotEmpty()
  @MaxLength(50)
  @MinLength(4)
  @ApiProperty({
    name: 'name'
  })
  name: string;

  constructor(data: TEntityResponse<'role', undefined, undefined>) {
    this.name = data.name;
  }
}
