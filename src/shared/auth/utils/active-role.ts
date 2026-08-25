/**
 * Rol vigente de un usuario a partir de sus filas de `user_role`.
 *
 * Dos cosas que hay que tener en cuenta:
 *
 * 1. Cambiar de rol NO borra la fila anterior: la marca con `isDeleted` e
 *    inserta una nueva. Un `find()` sin filtrar devuelve la MÁS VIEJA y el
 *    usuario parece conservar el rol anterior para siempre.
 *
 * 2. Un usuario puede tener VARIOS roles activos a la vez. Pasa, por ejemplo,
 *    cuando se asigna a un administrador como validador de un evento: se le
 *    suma `Validador` sin quitarle `Administrador`. Los guards aceptan
 *    cualquiera de sus roles, pero la sesión y la interfaz manejan uno solo.
 *
 * Por eso se resuelve por PRIVILEGIO y no por antigüedad: con "el más reciente"
 * el administrador recién asignado a una puerta pasaba a verse como validador y
 * perdía el acceso al backoffice.
 */
type UserRoleLike = {
  isDeleted?: Date | string | null;
  createdAt?: Date | string | null;
  role?: { uuid: string; name: string } | null;
};

/** Mayor número = más privilegio. Un rol desconocido queda por debajo de todos. */
const ROLE_RANK: Record<string, number> = {
  Administrador: 40,
  Productor: 30,
  Validador: 20,
  Caja: 15,
  Cliente: 10
};

function rankOf(name?: string | null): number {
  return name ? (ROLE_RANK[name] ?? 0) : 0;
}

export function resolveActiveRole(userRoles?: UserRoleLike[] | null): { uuid: string; name: string } | null {
  if (!Array.isArray(userRoles) || userRoles.length === 0) return null;

  const active = userRoles.filter(ur => !ur.isDeleted && ur.role);
  if (active.length === 0) return null;

  // Mayor privilegio; a igual privilegio, el más reciente
  const winner = active.reduce((best, current) => {
    const bestRank = rankOf(best.role?.name);
    const currentRank = rankOf(current.role?.name);
    if (currentRank !== bestRank) return currentRank > bestRank ? current : best;

    const bestAt = best.createdAt ? new Date(best.createdAt).getTime() : 0;
    const currentAt = current.createdAt ? new Date(current.createdAt).getTime() : 0;
    return currentAt > bestAt ? current : best;
  });

  return winner.role ? { uuid: winner.role.uuid, name: winner.role.name } : null;
}
