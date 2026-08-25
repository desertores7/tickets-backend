import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, MinLength, ValidateIf } from 'class-validator';
import { CREATE_STAFF_ROLES } from '@modules/organization/const/organization-staff.const';

export class CreateStaffRequest {
  @ApiProperty({ enum: CREATE_STAFF_ROLES })
  @IsIn([...CREATE_STAFF_ROLES])
  role: (typeof CREATE_STAFF_ROLES)[number];

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  lastName?: string;

  @ApiPropertyOptional({ type: [String], description: 'Required when role is cashier' })
  @ValidateIf(o => o.role === 'cashier')
  @IsArray()
  @IsUUID('4', { each: true })
  eventUuids?: string[];
}
