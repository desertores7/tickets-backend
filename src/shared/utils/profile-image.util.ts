/**
 * La imagen de perfil siempre se guarda como `{userUuid}.webp`, asi que la URL
 * no cambia al reemplazarla y el navegador sigue mostrando la anterior. Se le
 * cuelga la fecha de actualizacion como version para romper ese cache.
 */
export function buildProfileImageUrl(
  file: { path: string | null; updatedAt?: Date | null } | null | undefined
): string {
  const path = file?.path?.trim();
  if (!path) return '';

  const version = file?.updatedAt ? new Date(file.updatedAt).getTime() : null;
  if (!version) return path;

  return `${path}${path.includes('?') ? '&' : '?'}v=${version}`;
}
