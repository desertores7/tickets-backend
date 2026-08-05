import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Igual que @User() pero tolera la ausencia de sesión: devuelve null en vez de
 * romper. Para endpoints con @OptionalUserAuth, donde el visitante puede ser anónimo.
 */
export const OptionalUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): string | null => {
  const request = ctx.switchToHttp().getRequest();
  return request.user?.uuid ?? null;
});
