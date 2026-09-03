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

/**
 * Traduce el `order_by` del cliente al `order` de TypeORM, aceptando solo las
 * columnas declaradas: una columna arbitraria en un ORDER BY es una via de
 * escape hacia campos que el listado no expone.
 */
export function resolveListOrder<T extends readonly string[]>(
  order: IOrderParams<T>,
  allowed: T,
  fallback: Record<string, 'ASC' | 'DESC'>
): Record<string, 'ASC' | 'DESC'> {
  if (!order || !allowed.includes(order.order_by)) return fallback;
  return { [order.order_by]: order.order_direction === 'desc' ? 'DESC' : 'ASC' };
}

export type IOrderParams<T extends readonly string[]> =
  | undefined
  | {
      order_by: T[number];
      order_direction: 'asc' | 'desc';
    };
