import { applyDecorators, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';

export function ApiSearch() {
  return applyDecorators(
    ApiQuery({
      name: 'search',
      type: String,
      required: false
    })
  );
}

export const SearchParams = createParamDecorator((_data, ctx: ExecutionContext): ISearchParams => {
  const req = ctx.switchToHttp().getRequest();
  const search = req.query?.search || '';
  return { search: search.toLowerCase() };
});

export interface ISearchParams {
  search: string;
}
