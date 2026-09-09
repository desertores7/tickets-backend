import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiResponseMetadata } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Swagger } from '@root/shared/decorators/swagger.decorator';
import { CONTENT_TYPE } from '@root/shared/const/content-type.contant';
import { RoleGuard } from '../guards/role.guard';
import { Roles } from './roles.decorator';

/**
 * JWT + rol Cliente (favoritos y superficies del comprador).
 */
export function ClientAuth(
  requestType: ApiResponseMetadata['type'] | null,
  responseType: ApiResponseMetadata['type'] | null,
  contentType: CONTENT_TYPE = CONTENT_TYPE.JSON,
  bearerName = 'access-token'
) {
  return applyDecorators(
    UseGuards(AuthGuard('user-jwt'), RoleGuard),
    Roles('Cliente'),
    ApiBearerAuth(bearerName),
    Swagger(requestType, responseType, contentType)
  );
}
