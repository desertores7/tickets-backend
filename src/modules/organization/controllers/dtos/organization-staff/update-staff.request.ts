import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateStaffEventAssignmentRequest {
  @ApiPropertyOptional()
  @IsUUID('4')
  eventUuid: string;

  @ApiPropertyOptional()
  @IsBoolean()
  isHidden: boolean;
}

export class UpdateStaffRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Si se envía, reemplaza la contraseña actual.' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  eventUuids?: string[];

  @ApiPropertyOptional({ type: [UpdateStaffEventAssignmentRequest] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateStaffEventAssignmentRequest)
  eventAssignments?: UpdateStaffEventAssignmentRequest[];
}
