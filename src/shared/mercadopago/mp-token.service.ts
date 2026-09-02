import { Injectable, Logger } from '@nestjs/common';
import { MercadoPagoConfig, OAuth } from 'mercadopago';
import { DBRepository } from '@config/db/db.repository';
import { EnvService } from '@config/env/env.service';
import { OrgMpAccountEntity } from '@config/db/entities/tickets/org_mp_account.entity';
import { TokenCipher } from '@root/shared/crypto/token-cipher';

/**
 * Margen antes del vencimiento. Evita el caso borde de un token que vence en
 * mitad de una sincronización, que puede recorrer varias páginas de pagos.
 */
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * Resuelve access tokens de las cuentas MP de las productoras (`BR-CASH-001`).
 *
 * Vive fuera de `org-mp` porque el job de movimientos (`BR-CASH-003`) corre en
 * su propio módulo y necesita exactamente lo mismo: un token utilizable, con
 * refresh transparente y sin tumbar la corrida si el refresh falla.
 */
@Injectable()
export class MpTokenService {
  private readonly logger = new Logger(MpTokenService.name);

  constructor(
    private readonly dbRepository: DBRepository,
    private readonly envService: EnvService,
    private readonly tokenCipher: TokenCipher
  ) {}

  /** Devuelve un access token utilizable, renovándolo si está por vencer. */
  async resolveUsableAccessToken(account: OrgMpAccountEntity): Promise<string> {
    const expiresSoon =
      account.tokenExpiresAt !== null &&
      new Date(account.tokenExpiresAt).getTime() - Date.now() < TOKEN_REFRESH_MARGIN_MS;

    if (!expiresSoon || !account.refreshTokenEncrypted) {
      return this.tokenCipher.decrypt(account.accessTokenEncrypted);
    }

    const clientId = this.envService.get('MERCADOPAGO_CLIENT_ID');
    const clientSecret = this.envService.get('MERCADOPAGO_CLIENT_SECRET');

    // Sin credenciales de app no hay refresh posible. Se sigue con el token
    // viejo en vez de cortar: puede que todavía sirva.
    if (!clientId || !clientSecret) {
      return this.tokenCipher.decrypt(account.accessTokenEncrypted);
    }

    try {
      const platformToken = this.envService.get('MERCADOPAGO_ACCESS_TOKEN') ?? '';
      const oauth = new OAuth(new MercadoPagoConfig({ accessToken: platformToken }));

      const refreshed = await oauth.refresh({
        body: {
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: this.tokenCipher.decrypt(account.refreshTokenEncrypted)
        }
      });

      if (!refreshed?.access_token) throw new Error('Mercado Pago no devolvió un token nuevo');

      await this.dbRepository.update({
        entity: 'org_mp_account',
        where: { uuid: account.uuid },
        data: {
          accessTokenEncrypted: this.tokenCipher.encrypt(refreshed.access_token),
          refreshTokenEncrypted: refreshed.refresh_token
            ? this.tokenCipher.encrypt(refreshed.refresh_token)
            : account.refreshTokenEncrypted,
          tokenExpiresAt: refreshed.expires_in
            ? new Date(Date.now() + refreshed.expires_in * 1000)
            : null
        }
      });

      return refreshed.access_token;
    } catch (error) {
      this.logger.warn(
        `No se pudo renovar el token de la cuenta ${account.uuid}: ${
          error instanceof Error ? error.message : error
        }`
      );
      return this.tokenCipher.decrypt(account.accessTokenEncrypted);
    }
  }
}
