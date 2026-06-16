import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiHeader, ApiResponse, ApiResponseMetadata } from '@nestjs/swagger';
import { CONTENT_TYPE } from '../const/content-type.contant';

export function Swagger(
  requestType: ApiResponseMetadata['type'] | null,
  responseType: ApiResponseMetadata['type'] | null,
  contentTypes: CONTENT_TYPE | string | string[] = CONTENT_TYPE.JSON,
  requiredClientIdHeader = false
) {
  const consumes = (Array.isArray(contentTypes) ? contentTypes : [contentTypes]) as string[];
  const decorators: (ClassDecorator | MethodDecorator | PropertyDecorator)[] = [ApiConsumes(...consumes)];

  if (requiredClientIdHeader) {
    decorators.push(ApiHeader({ name: 'client_id', required: true }));
  }
  if (requestType) {
    decorators.push(ApiBody({ type: requestType }));
  }

  if (responseType) {
    decorators.push(ApiResponse({ type: responseType, status: 200 }));
  }

  return applyDecorators(...decorators);
}
