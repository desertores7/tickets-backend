import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf
} from 'class-validator';

export const EVENT_EMPLOYEE_ROLES = ['validator', 'cashier'] as const;
export type TEventEmployeeRole = (typeof EVENT_EMPLOYEE_ROLES)[number];

/**
 * Asigna un empleado al evento (existente o alta).
 * - Con `userUuid`: asigna cuenta existente.
 * - Sin `userUuid`: crea cuenta con email/password y la asigna.
 * El `role` decide rol (`Validador` / `Caja`) y tabla de asignación.
 */
export class UpsertEventEmployeeRequest {
  @ApiProperty({ enum: EVENT_EMPLOYEE_ROLES, description: 'Rol en este evento' })
  @IsIn([...EVENT_EMPLOYEE_ROLES])
  role: TEventEmployeeRole;

  @ApiPropertyOptional({ description: 'Usuario existente a asignar. Si falta, se crea uno nuevo.' })
  @IsOptional()
  @IsUUID()
  userUuid?: string;

  @ApiPropertyOptional({ description: 'Requerido al crear usuario nuevo' })
  @ValidateIf(o => !o.userUuid)
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Requerido al crear usuario nuevo', minLength: 8 })
  @ValidateIf(o => !o.userUuid)
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
}
