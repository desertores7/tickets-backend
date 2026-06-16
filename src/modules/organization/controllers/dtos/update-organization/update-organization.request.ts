import { ApiProperty } from '@nestjs/swagger';
import { TEntityResponse } from '@config/db/meta/db.types';
import { IsNotEmpty, MaxLength, MinLength } from 'class-validator';

export class UpdateOrganizationRequest {
  @IsNotEmpty()
  @MaxLength(50)
  @MinLength(4)
  @ApiProperty({
    name: 'name'
  })
  name: string;

  constructor(data: TEntityResponse<'organization', undefined, undefined>) {
    this.name = data.name;
  }
}
