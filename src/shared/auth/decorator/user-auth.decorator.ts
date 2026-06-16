// shared/decorators/user-auth.decorator.ts
import { applyDecorators, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Swagger } from '@root/shared/decorators/swagger.decorator';
import { ApiResponseMetadata } from '@nestjs/swagger';
import { CONTENT_TYPE } from '@root/shared/const/content-type.contant';

export function UserAuth(
  requestType: ApiResponseMetadata['type'] | null,
  responseType: ApiResponseMetadata['type'] | null,
  ...contentTypes: (CONTENT_TYPE | string)[]
) {
  const consumes = contentTypes.length > 0 ? contentTypes : [CONTENT_TYPE.JSON];
  return applyDecorators(
    UseGuards(AuthGuard('user-jwt')),
    ApiBearerAuth('access-token'),
    Swagger(requestType, responseType, consumes)
  );
}
