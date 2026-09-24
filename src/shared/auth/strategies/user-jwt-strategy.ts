import { EnvService } from '@config/env/env.service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

/**
 * Ademas del header Authorization, acepta el JWT por query (`?token=`).
 *
 * Es unicamente para el stream SSE del contador de check-in
 * (`GET /check-in/counter/:eventId/stream`): el `EventSource` nativo del
 * navegador no permite mandar headers custom, asi que ese endpoint no tiene
 * otra forma de autenticarse. El resto de la API sigue mandando el token por
 * header como siempre; esto solo agrega una fuente mas, nunca reemplaza la
 * del header.
 */
const fromQueryParameter = (paramName: string) => (req: Request): string | null => {
  const value = req?.query?.[paramName];
  return typeof value === 'string' && value ? value : null;
};

@Injectable()
export class UserJwtStrategy extends PassportStrategy(Strategy, 'user-jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        fromQueryParameter('token')
      ]),
      secretOrKey: config.get<string>('JWT_SECRET') || '',
      ignoreExpiration: false
    });
  }

  validate(payload: JwtPayload) {
    return { uuid: payload.sub, email: payload.email, role: payload.role };
  }
}
