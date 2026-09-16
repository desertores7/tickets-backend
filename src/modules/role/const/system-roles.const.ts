/**
 * Roles que el sistema referencia **por nombre** y por eso no se pueden
 * renombrar ni eliminar (`BR-ROLE-001`).
 *
 * `RoleGuard` autoriza comparando `role.name` con el nombre que declara cada
 * decorador (`@AdminAuth` → 'Administrador', etc.). Si alguien renombra o borra
 * uno de estos, los guards dejan de reconocerlo: todo el equipo pierde acceso a
 * su backoffice y no queda pantalla desde donde devolverlo — habría que
 * arreglarlo a mano en la base.
 *
 * Si se agrega un rol nuevo a un decorador, su nombre va también acá.
 */
export const SYSTEM_ROLE_NAMES = [
  'Administrador',
  'Operador',
  'Productor',
  'Cliente',
  'Validador',
  'Caja'
] as const;

/** Compara sin distinguir mayúsculas ni espacios, igual que `RoleGuard`. */
export function isSystemRoleName(name: string | null | undefined): boolean {
  if (!name) return false;
  const normalized = name.trim().toLowerCase();
  return SYSTEM_ROLE_NAMES.some(role => role.toLowerCase() === normalized);
}
