import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DBRepository } from '@config/db/db.repository';
import { IsNull } from 'typeorm';
import { ROLES_KEY } from '../decorator/roles.decorator';

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Inject(DBRepository) private dbRepository: DBRepository
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Obtener los roles requeridos del decorador
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    // Si no hay roles requeridos, permitir acceso
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // Obtener el usuario de la request (ya validado por el AuthGuard)
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.uuid) {
      throw new ForbiddenException('Usuario no autenticado');
    }

    // Buscar todos los roles activos del usuario
    const userRoles = await this.dbRepository.findMany({
      entity: 'user_role',
      where: {
        userUuid: user.uuid,
        isDeleted: IsNull()
      },
      relations: {
        role: true
      }
    });

    if (!userRoles || userRoles.length === 0) {
      throw new ForbiddenException('Usuario sin rol asignado');
    }

    // Verificar si alguno de los roles del usuario está en los roles requeridos
    const userRoleNames: string[] = [];
    for (const userRole of userRoles) {
      if (userRole.role && userRole.role.name) {
        userRoleNames.push(userRole.role.name);
      }
    }

    const hasRequiredRole = userRoleNames.some(userRoleName =>
      requiredRoles.some(requiredRole => requiredRole.toLowerCase().trim() === userRoleName.toLowerCase().trim())
    );

    if (!hasRequiredRole) {
      throw new ForbiddenException(
        `Acceso denegado. Se requiere uno de los siguientes roles: ${requiredRoles.join(', ')}. ` +
          `Tu rol actual: ${userRoleNames.join(', ')}`
      );
    }

    return true;
  }
}
