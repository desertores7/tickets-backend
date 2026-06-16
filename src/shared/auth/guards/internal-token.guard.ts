import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { ISystemParameterService } from '@modules/system-parameter/services/contracts/isystem-parameter.service';

/** Clave del parámetro de sistema donde se guarda el token de larga duración para APIs internas */
export const INTERNAL_API_TOKEN_KEY = 'internal_api.token';

@Injectable()
export class InternalTokenGuard implements CanActivate {
  constructor(
    @Inject('ISystemParameterService')
    private readonly systemParameterService: ISystemParameterService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.getBearerToken(request) ?? request.headers['x-internal-token'];

    if (!token || typeof token !== 'string') {
      throw new UnauthorizedException(
        'Token requerido. Envía Authorization: Bearer <token> o header X-Internal-Token.'
      );
    }

    const storedToken = await this.systemParameterService.getParameterValue(INTERNAL_API_TOKEN_KEY, '').catch(() => '');

    if (!storedToken) {
      throw new UnauthorizedException(
        'Token interno no configurado. Genera uno desde system-parameters/internal-token/generate.'
      );
    }

    if (!this.timingSafeEqual(token.trim(), storedToken.trim())) {
      throw new UnauthorizedException('Token inválido.');
    }

    return true;
  }

  private getBearerToken(req: Request): string | undefined {
    const auth = req.headers.authorization;
    if (!auth || typeof auth !== 'string') return undefined;
    const [scheme, value] = auth.split(/\s+/);
    return scheme?.toLowerCase() === 'bearer' ? value : undefined;
  }

  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }
}
