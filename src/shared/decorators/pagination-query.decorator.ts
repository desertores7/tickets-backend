import { applyDecorators, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';

export function ApiPagination() {
  return applyDecorators(
    ApiQuery({
      name: 'page',
      type: Number,
      required: false,
      example: 1
    }),
    ApiQuery({
      name: 'limit',
      type: Number,
      required: false,
      example: 10
    })
  );
}

export const PaginationParams = createParamDecorator((_data, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  const page = Number(req.query?.page) || 1;
  const limit = Number(req.query?.limit) || 10;
  return { page, limit };
});

export interface IPaginationParams {
  page: number;
  limit: number;
}
