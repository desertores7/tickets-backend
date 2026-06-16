import { FormUrlEncodedInterceptor } from '@middlewares/form-url-encoded.interceptor';
import { UseGuards, UseInterceptors, applyDecorators } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiResponseMetadata, ApiTags } from '@nestjs/swagger';
import { CONTENT_TYPE } from '@root/shared/const/content-type.contant';
import { Swagger } from '@root/shared/decorators/swagger.decorator';

export function ServerAuth(
  requesType: ApiResponseMetadata['type'] | null,
  responseType: ApiResponseMetadata['type'] | null,
  contentType: CONTENT_TYPE = CONTENT_TYPE.JSON
) {
  const decorators = [
    ApiTags('server'),
    ApiBearerAuth(),
    UseGuards(AuthGuard('client-credential')),
    Swagger(requesType, responseType, contentType, true)
  ];

  if (contentType === CONTENT_TYPE.FORM_URLENCODED) {
    decorators.push(UseInterceptors(FormUrlEncodedInterceptor));
  }

  return applyDecorators(...decorators);
}
