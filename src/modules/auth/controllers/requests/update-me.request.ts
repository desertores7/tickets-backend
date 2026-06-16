import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateMeRequest {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @ApiProperty({ name: 'firstName', required: false })
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @ApiProperty({ name: 'lastName', required: false })
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @ApiProperty({ name: 'email', required: false })
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ApiProperty({ name: 'username', required: false })
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @ApiProperty({ name: 'phone', required: false })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  @ApiProperty({ name: 'dni', required: false })
  dni?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @ApiProperty({ name: 'gender', required: false })
  gender?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ name: 'birthday', required: false, description: 'Date in ISO format (YYYY-MM-DD)' })
  birthday?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ name: 'password', required: false, description: 'New password (omit to keep current)' })
  password?: string;

  @IsOptional()
  @ApiProperty({
    name: 'imgProfile',
    type: 'string',
    format: 'binary',
    required: false,
    description: 'Profile image (image/* only, stored as webp)'
  })
  imgProfile?: Express.Multer.File;
}
