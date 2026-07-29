import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Autenticación opcional: si viene un JWT válido puebla `request.user`;
 * si no viene (o es inválido) deja pasar con `user = null` en lugar de lanzar 401.
 *
 * Para endpoints públicos cuya respuesta cambia según quién mira —
 * ej. el listado de eventos, donde un admin ve también los borradores.
 */
@Injectable()
export class OptionalUserJwtGuard extends AuthGuard('user-jwt') {
  handleRequest<TUser>(_err: unknown, user: TUser): TUser | null {
    return (user ?? null) as TUser | null;
  }
}
