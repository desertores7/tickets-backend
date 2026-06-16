import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiResponse } from '@nestjs/swagger';
import { Swagger } from '@root/shared/decorators/swagger.decorator';
import { ApiResponseMetadata } from '@nestjs/swagger';
import { CONTENT_TYPE } from '@root/shared/const/content-type.contant';
import { InternalTokenGuard } from '../guards/internal-token.guard';

/**
 * Decorador para endpoints internos que requieren token de larga duración.
 * No usa JWT; valida el header Authorization: Bearer <token> o X-Internal-Token
 * contra el parámetro de sistema internal_api.token.
 */
export function InternalTokenAuth(
  requestType: ApiResponseMetadata['type'] | null,
  responseType: ApiResponseMetadata['type'] | null,
  contentType: CONTENT_TYPE = CONTENT_TYPE.JSON
) {
  return applyDecorators(
    UseGuards(InternalTokenGuard),
    ApiHeader({
      name: 'X-Internal-Token',
      description: 'Token de larga duración para APIs internas (alternativa: Authorization: Bearer <token>)',
      required: false
    }),
    ApiResponse({ status: 401, description: 'Token ausente o inválido' }),
    Swagger(requestType, responseType, contentType)
  );
}
