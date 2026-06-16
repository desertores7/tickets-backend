import { ApiProperty } from '@nestjs/swagger';
import { TEntityResponse } from '@config/db/meta/db.types';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateOrganizationRequest {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  @ApiProperty({
    name: 'name',
    description: 'Name of the organization'
  })
  name: string;

  constructor(data: TEntityResponse<'organization', undefined, undefined>) {
    this.name = data.name;
  }
}
