import { applyDecorators, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ApiResponseMetadata } from '@nestjs/swagger';
import { Swagger } from '@root/shared/decorators/swagger.decorator';
import { CONTENT_TYPE } from '@root/shared/const/content-type.contant';
import { RoleGuard } from '../guards/role.guard';
import { Roles } from './roles.decorator';

/**
 * Aplica autenticación JWT + validación de rol (Validador o Administrador).
 * Equivalente a @UserAuth pero con RoleGuard incluido.
 * Los nombres deben coincidir con la tabla `role` (seeds: SeedDefaultRoles, SeedValidadorRole).
 */
export function ValidatorAuth(
  requestType: ApiResponseMetadata['type'] | null,
  responseType: ApiResponseMetadata['type'] | null
) {
  return applyDecorators(
    UseGuards(AuthGuard('user-jwt'), RoleGuard),
    ApiBearerAuth('access-token'),
    Roles('Validador', 'Administrador'),
    Swagger(requestType, responseType, [CONTENT_TYPE.JSON])
  );
}
