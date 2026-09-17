import { DBRepository } from '@config/db/db.repository';
import { IsNull } from 'typeorm';

/**
 * `true` si el usuario tiene el rol `Administrador` (equipo de Showpass).
 *
 * Existe para los servicios que validan acceso por membresía a la productora
 * sin inyectar `UserPermissionService` (que arrastra HttpModule). El
 * Administrador opera cualquier evento/productora con permisos de Productor:
 * es quien asiste a las productoras desde `/admin`.
 */
export async function isAdministrador(dbRepository: DBRepository, userUuid: string): Promise<boolean> {
  if (!userUuid) return false;
  const roles = (await dbRepository.findMany({
    entity: 'user_role',
    where: { userUuid, isDeleted: IsNull() } as never,
    relations: { role: true } as never
  })) as { role?: { name?: string } }[];
  return roles.some(r => r.role?.name === 'Administrador');
}
