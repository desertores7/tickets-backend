/**
 * Rol vigente de un usuario a partir de sus filas de `user_role`.
 *
 * Cambiar de rol NO borra la fila anterior: la marca con `isDeleted` e inserta
 * una nueva. Por eso un `find()` sin filtrar devuelve la MÁS VIEJA y el usuario
 * parece conservar el rol anterior para siempre. Ante varias activas se toma la
 * más reciente.
 */
type UserRoleLike = {
  isDeleted?: Date | string | null;
  createdAt?: Date | string | null;
  role?: { uuid: string; name: string } | null;
};

export function resolveActiveRole(userRoles?: UserRoleLike[] | null): { uuid: string; name: string } | null {
  if (!Array.isArray(userRoles) || userRoles.length === 0) return null;

  const active = userRoles.filter(ur => !ur.isDeleted && ur.role);
  if (active.length === 0) return null;

  const newest = active.reduce((latest, current) => {
    const a = latest.createdAt ? new Date(latest.createdAt).getTime() : 0;
    const b = current.createdAt ? new Date(current.createdAt).getTime() : 0;
    return b > a ? current : latest;
  });

  return newest.role ? { uuid: newest.role.uuid, name: newest.role.name } : null;
}
