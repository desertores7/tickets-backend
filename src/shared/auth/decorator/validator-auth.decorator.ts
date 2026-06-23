import { applyDecorators, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ApiResponseMetadata } from '@nestjs/swagger';
import { Swagger } from '@root/shared/decorators/swagger.decorator';
import { CONTENT_TYPE } from '@root/shared/const/content-type.contant';
import { RoleGuard } from '../guards/role.guard';
import { Roles } from './roles.decorator';

/**
 * Aplica autenticación JWT + validación de rol (validador o admin).
 * Equivalente a @UserAuth pero con RoleGuard incluido.
 */
export function ValidatorAuth(
  requestType: ApiResponseMetadata['type'] | null,
  responseType: ApiResponseMetadata['type'] | null
) {
  return applyDecorators(
    UseGuards(AuthGuard('user-jwt'), RoleGuard),
    ApiBearerAuth('access-token'),
    Roles('validador', 'admin'),
    Swagger(requestType, responseType, [CONTENT_TYPE.JSON])
  );
}
