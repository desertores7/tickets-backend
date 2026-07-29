import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiResponseMetadata } from '@nestjs/swagger';
import { Swagger } from '@root/shared/decorators/swagger.decorator';
import { CONTENT_TYPE } from '@root/shared/const/content-type.contant';
import { OptionalUserJwtGuard } from '../guards/optional-user-jwt.guard';

/**
 * Endpoint público con autenticación opcional.
 * Sin token responde igual (contenido público); con token válido la respuesta
 * puede ampliarse según el rol (ej. un admin ve también eventos no publicados).
 */
export function OptionalUserAuth(
  requestType: ApiResponseMetadata['type'] | null,
  responseType: ApiResponseMetadata['type'] | null,
  ...contentTypes: (CONTENT_TYPE | string)[]
) {
  const consumes = contentTypes.length > 0 ? contentTypes : [CONTENT_TYPE.JSON];
  return applyDecorators(
    UseGuards(OptionalUserJwtGuard),
    ApiBearerAuth('access-token'),
    Swagger(requestType, responseType, consumes)
  );
}
