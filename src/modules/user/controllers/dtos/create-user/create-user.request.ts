import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateUserRequest {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    name: 'firstName',
    description: 'First name of the user',
    default: '',
    nullable: true
  })
  firstName: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    name: 'lastName',
    description: 'Last name of the user',
    default: ''
  })
  lastName: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    name: 'email',
    description: 'Email of the user',
    default: ''
  })
  email: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    name: 'password',
    description: 'Password of the user',
    default: ''
  })
  password: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    name: 'roleUuid',
    description: 'Role uuid of the user. If not provided, the default role "Vendedor" will be assigned',
    required: false,
    default: ''
  })
  roleUuid?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    name: 'activeUser',
    description: 'Status of the user',
    required: false,
    default: 0
  })
  activeUser?: number;
}
