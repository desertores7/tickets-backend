import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AssignRoleRequest {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    name: 'roleUuid',
    description: 'UUID of the role to assign to the user',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  roleUuid: string;
}
