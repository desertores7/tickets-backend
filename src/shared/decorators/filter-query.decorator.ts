import { applyDecorators, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import { ClassConstructor } from 'class-transformer';

export type IFilterData = {
  name: string;
  type: ClassConstructor<unknown>;
  required?: boolean;
  enumValues?: string[];
};

export function ApiFilter(filters: readonly IFilterData[]) {
  return applyDecorators(
    ...filters.map(({ name, type, required, enumValues }) =>
      ApiQuery({
        name,
        type,
        required,
        enum: enumValues
      })
    )
  );
}

export const FilterParams = <T extends readonly IFilterData[]>(filters: T) =>
  createParamDecorator((_data, ctx: ExecutionContext): IFiltersParams<T> => {
    const req = ctx.switchToHttp().getRequest();

    const obj = {} as IFiltersParams<T>;

    filters.forEach((filter: T[number]) => {
      if (req.query[filter.name]) {
        obj[filter.name as keyof IFiltersParams<T>] = req.query[filter.name].split(',');
      }
    });

    return obj;
  })();

export type IFiltersParams<T extends readonly IFilterData[]> = Record<T[number]['name'], string[]>;
