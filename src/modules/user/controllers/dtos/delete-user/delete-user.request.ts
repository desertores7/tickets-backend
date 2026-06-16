import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class DeleteUserRequest {
  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({
    name: 'arrayUuids',
    type: 'string',
    required: true,
    description: 'Array of user uuids',
    example: ['123e4567-e89b-12d3-a456-426614174000', '123e4567-e89b-12d3-a456-426614174001'],
    default: []
  })
  arrayUuids: string[];
}
