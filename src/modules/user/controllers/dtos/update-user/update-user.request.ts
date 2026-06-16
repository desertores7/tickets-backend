import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateUserRequest {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @ApiProperty({
    name: 'firstName',
    type: 'string',
    required: false,
    description: 'First name of the user',
    default: ''
  })
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @ApiProperty({
    name: 'lastName',
    type: 'string',
    required: false,
    description: 'Last name of the user',
    default: ''
  })
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @ApiProperty({
    name: 'email',
    type: 'string',
    required: false,
    description: 'Email of the user',
    default: ''
  })
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ApiProperty({
    name: 'username',
    type: 'string',
    required: false,
    description: 'Login username (omit to keep current; empty string clears it)',
    default: ''
  })
  username?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    name: 'password',
    type: 'string',
    required: false,
    description: 'New password of the user (omit to keep current)',
    default: ''
  })
  password?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    name: 'roleUuid',
    description: 'Role uuid of the user. If provided, replaces the current active role assignment.',
    required: false,
    default: ''
  })
  roleUuid?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    name: 'activeUser',
    type: Number,
    description: 'Status of the user (same field as create user)',
    required: false,
    default: 0
  })
  activeUser?: string | number;
}
