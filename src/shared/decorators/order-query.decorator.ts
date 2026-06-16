import { applyDecorators, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';

export function ApiOrder(orderBy: readonly string[]) {
  return applyDecorators(
    ApiQuery({
      name: 'order_by',
      type: String,
      required: false,
      enum: orderBy.reduce((acc: string[], curr) => {
        acc.push(`${curr}:asc`);
        acc.push(`${curr}:desc`);
        return acc;
      }, [])
    })
  );
}

export const OrderParams = createParamDecorator((_data, ctx: ExecutionContext): IOrderParams<string[]> => {
  const req = ctx.switchToHttp().getRequest();
  const order_by = req.query?.order_by as string | undefined;

  if (!order_by) {
    return;
  }

  const [order_by_column, order_by_direction] = order_by.split(':') as [string, string];

  const lowerOrderDirection = order_by_direction.toLowerCase();

  if (!order_by_column || !order_by_direction || (lowerOrderDirection !== 'asc' && lowerOrderDirection !== 'desc')) {
    return;
  }

  return { order_by: order_by_column, order_direction: lowerOrderDirection };
});

export type IOrderParams<T extends readonly string[]> =
  | undefined
  | {
      order_by: T[number];
      order_direction: 'asc' | 'desc';
    };
