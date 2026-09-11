import { EnvService } from '@config/env/env.service';
import { RedisService } from '@config/redis/redis.service';
import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './auth.service';
import { TUserLoginAuthResponse } from '../contracts/iauth.service';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

/** Vida del `state`: lo que puede tardar alguien en elegir cuenta en Google. */
const STATE_TTL = '10m';
/** Vida del ticket de canje. Corto: el frontend lo consume al instante. */
const TICKET_TTL_SECONDS = 120;

const TICKET_PREFIX = 'google:ticket:';

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  name?: string;
};

/**
 * Login con Google por Authorization Code (`BR-AUTH-005`).
 *
 * El recorrido completo:
 *
 * 1. El front manda al navegador a `GET /auth/google`, que redirige a Google.
 * 2. Google vuelve a `GET /auth/google/callback` con un `code`.
 * 3. El backend canjea ese `code` por tokens **desde el servidor** y pide el
 *    perfil. El `client_secret` nunca sale de acá.
 * 4. Resuelve el usuario, guarda un **ticket de un solo uso** en Redis y
 *    redirige al front con ese ticket.
 * 5. El front lo canjea por `POST /auth/google/exchange` y recibe los tokens.
 *
 * **Por qué el ticket y no los tokens en la URL.** Un redirect con el
 * `access_token` en el query string lo deja en el historial del navegador, en
 * el `Referer` de la primera request que salga de esa página y en los logs de
 * cualquier proxy intermedio. El ticket dura 2 minutos, sirve una sola vez y
 * no autoriza nada por sí mismo.
 *
 * No usa `passport-google-oauth20`: son dos llamadas HTTP y la estrategia nos
 * obligaría a montar sesiones de passport que el resto del auth no usa.
 */
@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);

  constructor(
    private readonly envService: EnvService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly redisService: RedisService,
    private readonly authService: AuthService
  ) {}

  private get clientId(): string | undefined {
    return this.envService.get('GOOGLE_CLIENT_ID');
  }

  private get clientSecret(): string | undefined {
    return this.envService.get('GOOGLE_CLIENT_SECRET');
  }

  /** Está configurado el login con Google en este ambiente. */
  isEnabled(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  private frontendUrl(): string {
    return (this.envService.get('FRONTEND_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
  }

  /**
   * URI de retorno. Tiene que ser idéntica acá y en Google Cloud Console: si
   * difieren en una barra, Google corta con `redirect_uri_mismatch`.
   */
  private callbackUrl(): string {
    const explicit = this.envService.get('GOOGLE_CALLBACK_URL');
    if (explicit) return explicit;

    const base = (this.envService.get('APP_URL') ?? this.envService.get('BASE_URL') ?? '').replace(/\/$/, '');
    if (!base) {
      throw new ServiceUnavailableException('Falta configurar GOOGLE_CALLBACK_URL o APP_URL');
    }
    return `${base}/api/v1/auth/google/callback`;
  }

  private requireEnabled(): void {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('El ingreso con Google no está disponible');
    }
  }

  /**
   * Arranque del flujo. El `state` es un JWT corto: además de frenar el CSRF
   * del OAuth, se lleva a dónde volver, así el "iniciar sesión" desde una
   * página profunda no termina siempre en el home.
   */
  async buildAuthorizationUrl(redirectPath: string | null): Promise<string> {
    this.requireEnabled();

    const state = await this.jwt.signAsync(
      { purpose: 'google-oauth-state', redirect: this.safeRedirect(redirectPath) },
      { secret: this.config.get('JWT_SECRET'), expiresIn: STATE_TTL }
    );

    const params = new URLSearchParams({
      client_id: this.clientId as string,
      redirect_uri: this.callbackUrl(),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      // `select_account`: si la persona tiene varias cuentas, que elija. Sin
      // esto Google entra con la última usada sin preguntar.
      prompt: 'select_account'
    });

    return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
  }

  /** Solo rutas internas: un `redirect` a otro dominio es un open redirect. */
  private safeRedirect(raw: string | null | undefined): string | null {
    if (!raw) return null;
    if (!raw.startsWith('/') || raw.startsWith('//')) return null;
    return raw;
  }

  /**
   * Vuelta de Google. Devuelve siempre una URL del frontend: los errores
   * también, porque acá el "cliente" es el navegador de la persona, no el
   * front — un 401 en JSON le mostraría un volcado crudo.
   */
  async handleCallback(params: {
    code?: string;
    state?: string;
    error?: string;
  }): Promise<string> {
    const front = this.frontendUrl();

    if (params.error) {
      // `access_denied` es el caso normal de "cancelé en la pantalla de Google".
      const reason = params.error === 'access_denied' ? 'cancelado' : 'google';
      return `${front}/login?error=${reason}`;
    }

    let redirect: string | null = null;
    try {
      this.requireEnabled();

      if (!params.code || !params.state) {
        throw new UnauthorizedException('Respuesta de Google incompleta');
      }

      redirect = await this.verifyState(params.state);

      const accessToken = await this.exchangeCode(params.code);
      const profile = await this.fetchProfile(accessToken);

      const userUuid = await this.authService.resolveGoogleUser(profile);

      const ticket = uuidv4();
      await this.redisService.setEphemeral(TICKET_PREFIX + ticket, userUuid, TICKET_TTL_SECONDS);

      const query = new URLSearchParams({ ticket });
      if (redirect) query.set('next', redirect);
      return `${front}/auth/google?${query.toString()}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Callback de Google fallido: ${message}`);

      // El motivo viaja como texto para que el login lo muestre tal cual: son
      // mensajes nuestros ("la cuenta está desactivada"), no de Google.
      const detail = error instanceof UnauthorizedException ? message : 'No pudimos validar tu cuenta de Google';
      return `${front}/login?error=google&detail=${encodeURIComponent(detail)}`;
    }
  }

  private async verifyState(state: string): Promise<string | null> {
    let payload: { purpose?: string; redirect?: string | null };
    try {
      payload = await this.jwt.verifyAsync(state, { secret: this.config.get('JWT_SECRET') });
    } catch {
      throw new UnauthorizedException('El intento de ingreso venció. Probá de nuevo.');
    }

    if (payload.purpose !== 'google-oauth-state') {
      throw new UnauthorizedException('Intento de ingreso inválido');
    }

    return this.safeRedirect(payload.redirect);
  }

  /** Canje del `code` por un access token de Google. Servidor contra servidor. */
  private async exchangeCode(code: string): Promise<string> {
    const body = new URLSearchParams({
      code,
      client_id: this.clientId as string,
      client_secret: this.clientSecret as string,
      redirect_uri: this.callbackUrl(),
      grant_type: 'authorization_code'
    });

    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });

    if (!response.ok) {
      const detail = await response.text();
      this.logger.error(`Google rechazó el canje del código (${response.status}): ${detail}`);
      throw new UnauthorizedException('Google rechazó el ingreso');
    }

    const tokens = (await response.json()) as { access_token?: string };
    if (!tokens.access_token) {
      throw new UnauthorizedException('Google no devolvió un token');
    }

    return tokens.access_token;
  }

  /**
   * Perfil del dueño del token.
   *
   * Se pide al endpoint de Google con el access token en vez de decodificar el
   * `id_token`: el dato llega de una conexión TLS directa contra Google, así
   * que no hay firma que validar a mano ni librería extra que sumar.
   */
  private async fetchProfile(accessToken: string): Promise<{
    googleId: string;
    email: string;
    emailVerified: boolean;
    firstName: string;
    lastName: string;
  }> {
    const response = await fetch(GOOGLE_USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      throw new UnauthorizedException('No pudimos leer tu perfil de Google');
    }

    const info = (await response.json()) as GoogleUserInfo;

    if (!info.sub || !info.email) {
      throw new UnauthorizedException('Google no compartió tu email');
    }

    // `name` como respaldo: algunas cuentas no mandan given/family por separado.
    const partes = (info.name ?? '').trim().split(/\s+/);

    return {
      googleId: info.sub,
      email: info.email,
      emailVerified: info.email_verified === true,
      firstName: info.given_name?.trim() || partes[0] || 'Usuario',
      lastName: info.family_name?.trim() || partes.slice(1).join(' ')
    };
  }

  /** Canje del ticket por la sesión. Un ticket sirve una sola vez. */
  async exchangeTicket(ticket: string): Promise<TUserLoginAuthResponse> {
    const userUuid = await this.redisService.takeEphemeral(TICKET_PREFIX + ticket);

    if (!userUuid) {
      throw new UnauthorizedException('El ingreso venció o ya se usó. Probá de nuevo.');
    }

    return this.authService.loginByUserUuid(userUuid);
  }
}
