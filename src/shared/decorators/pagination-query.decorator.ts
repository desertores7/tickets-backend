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

/** Tope de filas por pagina: un `limit` sin techo es una descarga completa disfrazada. */
export const MAX_PAGE_LIMIT = 100;

export const PaginationParams = createParamDecorator((_data, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  const page = Math.max(Number(req.query?.page) || 1, 1);
  const rawLimit = Number(req.query?.limit) || 10;
  const limit = Math.min(Math.max(rawLimit, 1), MAX_PAGE_LIMIT);
  return { page, limit };
});

export interface IPaginationParams {
  page: number;
  limit: number;
}
