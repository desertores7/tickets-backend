import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsUUID, ValidateNested } from 'class-validator';
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
