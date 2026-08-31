import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Swagger } from '@root/shared/decorators/swagger.decorator';
import { ApiResponseMetadata } from '@nestjs/swagger';
import { CONTENT_TYPE } from '@root/shared/const/content-type.contant';
import { RoleGuard } from '../guards/role.guard';
import { Roles } from './roles.decorator';

/**
 * JWT + roles de backoffice operativo: Productor, Administrador o Caja.
 */
export function BackofficeAuth(
  requestType: ApiResponseMetadata['type'] | null,
  responseType: ApiResponseMetadata['type'] | null,
  contentType: CONTENT_TYPE = CONTENT_TYPE.JSON,
  bearerName = 'access-token'
) {
  return applyDecorators(
    UseGuards(AuthGuard('user-jwt'), RoleGuard),
    Roles('Productor', 'Administrador', 'Caja'),
    ApiBearerAuth(bearerName),
    Swagger(requestType, responseType, contentType)
  );
}
