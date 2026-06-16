import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Swagger } from '@root/shared/decorators/swagger.decorator';
import { ApiResponseMetadata } from '@nestjs/swagger';
import { CONTENT_TYPE } from '@root/shared/const/content-type.contant';
import { RoleGuard } from '../guards/role.guard';
import { Roles } from './roles.decorator';

/**
 * Decorador que combina autenticación de usuario y validación de rol Administrador
 * @param requestType Tipo de request para Swagger
 * @param responseType Tipo de response para Swagger
 * @param contentType Tipo de contenido (default: JSON)
 * @param bearerName Nombre del bearer token (default: 'access-token')
 */
export function AdminAuth(
  requestType: ApiResponseMetadata['type'] | null,
  responseType: ApiResponseMetadata['type'] | null,
  contentType: CONTENT_TYPE = CONTENT_TYPE.JSON,
  bearerName = 'access-token'
) {
  return applyDecorators(
    UseGuards(AuthGuard('user-jwt'), RoleGuard),
    Roles('Administrador'),
    ApiBearerAuth(bearerName),
    Swagger(requestType, responseType, contentType)
  );
}
