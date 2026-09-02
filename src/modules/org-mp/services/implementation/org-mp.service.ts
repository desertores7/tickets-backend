import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IsNull } from 'typeorm';
import { MercadoPagoConfig, OAuth, Payment as MPPayment } from 'mercadopago';
import { DBRepository } from '@config/db/db.repository';
import { EnvService } from '@config/env/env.service';
import { OrgMpAccountEntity } from '@config/db/entities/tickets/org_mp_account.entity';
import { MpCatalogItemEntity } from '@config/db/entities/tickets/mp_catalog_item.entity';
import { OrganizationEntity } from '@config/db/entities/user/organization.entity';
import { ORGANIZATION_STATUS } from '@modules/organization/const/organization-status.const';
import { TokenCipher } from '@root/shared/crypto/token-cipher';
import { MpTokenService } from '@root/shared/mercadopago/mp-token.service';
import { v4 as uuidv4 } from 'uuid';
import { ICatalogSyncResult, IMpAccount, IOrgMpService } from '../contracts/iorg-mp.service';

/** El `state` del OAuth vive poco: solo tiene que sobrevivir el viaje a MP. */
const STATE_TTL = '10m';

/** Ventana hacia atras que se recorre buscando productos en los pagos. */
const CATALOG_LOOKBACK_DAYS = 90;
const CATALOG_PAGE_SIZE = 50;
/** Tope de paginas: una cuenta con mucho volumen no debe colgar el request. */
const CATALOG_MAX_PAGES = 20;

type ConnectState = {
  organizationUuid: string;
  userUuid: string;
};

@Injectable()
export class OrgMpService implements IOrgMpService {
  private readonly logger = new Logger(OrgMpService.name);

  constructor(
    private readonly dbRepository: DBRepository,
    private readonly envService: EnvService,
    private readonly tokenCipher: TokenCipher,
    private readonly jwt: JwtService,
    private readonly mpTokenService: MpTokenService
  ) {}

  // ── Configuracion ───────────────────────────────────────────────────────────

  /**
   * Credenciales de la *aplicacion* de MP, distintas del access token del
   * checkout web: el OAuth necesita client_id y client_secret propios.
   */
  private requireAppCredentials(): { clientId: string; clientSecret: string; redirectUri: string } {
    const clientId = this.envService.get('MERCADOPAGO_CLIENT_ID');
    const clientSecret = this.envService.get('MERCADOPAGO_CLIENT_SECRET');
    const appUrl = this.envService.get('APP_URL');

    if (!clientId || !clientSecret) {
      throw new BadRequestException(
        'La conexión con Mercado Pago no está configurada en el servidor. ' +
          'Faltan MERCADOPAGO_CLIENT_ID y MERCADOPAGO_CLIENT_SECRET.'
      );
    }
    if (!appUrl) {
      throw new BadRequestException('Falta configurar APP_URL para armar la URL de retorno.');
    }

    // Tiene que coincidir EXACTAMENTE con la registrada en el panel de MP,
    // incluida la barra final o su ausencia.
    return {
      clientId,
      clientSecret,
      redirectUri: `${appUrl.replace(/\/$/, '')}/api/v1/organizations/me/mp-accounts/callback`
    };
  }

  private oauthClient(): OAuth {
    // El OAuth de MP se autentica con el access token de la plataforma.
    const accessToken = this.envService.get('MERCADOPAGO_ACCESS_TOKEN') ?? '';
    return new OAuth(new MercadoPagoConfig({ accessToken }));
  }

  // ── Alcance ─────────────────────────────────────────────────────────────────

  private async resolveOrganization(userUuid: string): Promise<OrganizationEntity> {
    const membership = await this.dbRepository.findOne({
      entity: 'user_organization',
      where: { userUuid, isDeleted: IsNull() },
      relations: { organization: { organizationStatus: true } },
      other: { order: { createdAt: 'ASC' } }
    });

    if (!membership?.organization || membership.organization.isDeleted) {
      throw new NotFoundException('No tenés una productora asociada');
    }

    return membership.organization as OrganizationEntity;
  }

  /**
   * Gate del spec (`29` §8b): conectar cuentas requiere productora aprobada.
   * Listar no lo requiere, para que la pantalla pueda explicar por que no se
   * puede conectar todavia en vez de tirar un error seco.
   */
  private assertApproved(organization: OrganizationEntity): void {
    if (organization.organizationStatusUuid !== ORGANIZATION_STATUS.APPROVED.uuid) {
      throw new BadRequestException(
        'Tu productora tiene que estar aprobada para conectar cuentas de Mercado Pago.'
      );
    }
  }

  private toAccount(entity: OrgMpAccountEntity): IMpAccount {
    return {
      uuid: entity.uuid,
      alias: entity.alias,
      mpUserId: entity.mpUserId,
      mpEmail: entity.mpEmail,
      status: entity.status,
      liveMode: entity.liveMode,
      lastCatalogSyncAt: entity.lastCatalogSyncAt,
      lastErrorMessage: entity.lastErrorMessage,
      createdAt: entity.createdAt
    };
  }

  // ── Operaciones ─────────────────────────────────────────────────────────────

  async listAccounts(loggedUser: string): Promise<IMpAccount[]> {
    const organization = await this.resolveOrganization(loggedUser);

    const accounts = await this.dbRepository.findMany({
      entity: 'org_mp_account',
      where: { organizationUuid: organization.uuid, isDeleted: IsNull() },
      other: { order: { createdAt: 'ASC' } }
    });

    return (accounts as OrgMpAccountEntity[]).map(a => this.toAccount(a));
  }

  async startConnect(loggedUser: string): Promise<{ authorizationUrl: string }> {
    const organization = await this.resolveOrganization(loggedUser);
    this.assertApproved(organization);

    if (!this.tokenCipher.isConfigured) {
      throw new BadRequestException(
        'El cifrado de tokens no está configurado en el servidor. Falta MP_TOKEN_ENCRYPTION_KEY.'
      );
    }

    const { clientId, redirectUri } = this.requireAppCredentials();

    // `state` firmado y con vencimiento: el callback llega sin sesion nuestra,
    // asi que es lo unico que ata la respuesta de MP a esta organizacion. Si
    // fuera un valor plano, cualquiera podria conectar su cuenta a otra org.
    const state = await this.jwt.signAsync(
      { organizationUuid: organization.uuid, userUuid: loggedUser } satisfies ConnectState,
      { expiresIn: STATE_TTL }
    );

    return {
      authorizationUrl: this.oauthClient().getAuthorizationURL({
        options: { client_id: clientId, redirect_uri: redirectUri, state }
      })
    };
  }

  async completeConnect(code: string, state: string): Promise<{ redirectUrl: string }> {
    let payload: ConnectState;
    try {
      payload = await this.jwt.verifyAsync<ConnectState>(state);
    } catch {
      throw new UnauthorizedException('El enlace de conexión venció o no es válido. Probá de nuevo.');
    }

    const { clientId, clientSecret, redirectUri } = this.requireAppCredentials();

    const tokens = await this.oauthClient().create({
      body: { client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }
    });

    if (!tokens?.access_token || !tokens.user_id) {
      throw new BadRequestException('Mercado Pago no devolvió las credenciales de la cuenta.');
    }

    const mpUserId = String(tokens.user_id);

    const existing = (await this.dbRepository.findOne({
      entity: 'org_mp_account',
      where: { organizationUuid: payload.organizationUuid, mpUserId }
    })) as OrgMpAccountEntity | null;

    const tokenExpiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    const credentials = {
      accessTokenEncrypted: this.tokenCipher.encrypt(tokens.access_token),
      refreshTokenEncrypted: tokens.refresh_token
        ? this.tokenCipher.encrypt(tokens.refresh_token)
        : null,
      tokenExpiresAt,
      liveMode: tokens.live_mode ?? true,
      status: 'connected' as const,
      lastErrorMessage: null,
      isDeleted: null
    };

    if (existing) {
      // Reconectar una cuenta ya conocida rota los tokens sobre la misma fila:
      // el historico ya copiado la sigue referenciando por uuid.
      await this.dbRepository.update({
        entity: 'org_mp_account',
        where: { uuid: existing.uuid },
        data: credentials
      });
    } else {
      const account = new OrgMpAccountEntity();
      account.organizationUuid = payload.organizationUuid;
      // Alias provisorio: la productora lo renombra desde la pantalla.
      account.alias = `Cuenta ${mpUserId}`;
      account.mpUserId = mpUserId;
      account.mpEmail = null;
      Object.assign(account, credentials);

      await this.dbRepository.create({ entity: 'org_mp_account', data: account });
    }

    this.logger.log(`Cuenta MP ${mpUserId} conectada a la organización ${payload.organizationUuid}`);

    const frontendUrl = this.envService.get('FRONTEND_URL') ?? this.envService.get('APP_URL') ?? '';
    return {
      redirectUrl: `${frontendUrl.replace(/\/$/, '')}/producer/organization/mp-accounts?connected=1`
    };
  }

  async updateAlias(loggedUser: string, accountUuid: string, alias: string): Promise<IMpAccount> {
    const account = await this.requireOwnAccount(loggedUser, accountUuid);

    await this.dbRepository.update({
      entity: 'org_mp_account',
      where: { uuid: account.uuid },
      data: { alias }
    });

    return this.toAccount({ ...account, alias });
  }

  async disconnect(loggedUser: string, accountUuid: string): Promise<void> {
    const account = await this.requireOwnAccount(loggedUser, accountUuid);

    // No se borra la fila ni se limpia el historico (`BR-CASH-001`). Si se
    // vacian los tokens, que dejan de servir apenas se revoca el permiso.
    await this.dbRepository.update({
      entity: 'org_mp_account',
      where: { uuid: account.uuid },
      data: {
        status: 'disconnected',
        accessTokenEncrypted: '',
        refreshTokenEncrypted: null,
        tokenExpiresAt: null
      }
    });
  }


  // ── Sincronizacion de catalogo (BR-CASH-002) ────────────────────────────────

  /**
   * Mercado Pago NO expone un catalogo de productos: su API tiene pagos,
   * ordenes, tiendas y terminales, pero ningun recurso de items. Lo unico que
   * puede traer nombres de productos es `additional_info.items` de cada pago, y
   * solo si quien cobro los envio.
   *
   * Por eso el "catalogo MP" se reconstruye recorriendo los pagos de la cuenta.
   * Un posnet donde se tipea el monto no manda items: esos pagos se cuentan y
   * se ignoran, nunca ensucian el catalogo con filas vacias.
   */
  async syncCatalog(loggedUser: string, accountUuid: string): Promise<ICatalogSyncResult> {
    const account = await this.requireOwnAccount(loggedUser, accountUuid);

    if (account.status !== 'connected') {
      throw new BadRequestException('La cuenta está desconectada. Reconectala para sincronizar.');
    }

    const accessToken = await this.resolveUsableAccessToken(account);
    const since = new Date(Date.now() - CATALOG_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const syncedAt = new Date();

    const paymentClient = new MPPayment(new MercadoPagoConfig({ accessToken }));

    let offset = 0;
    let scanned = 0;
    let withItems = 0;
    let withoutItems = 0;
    const found = new Map<string, { name: string; price: number | null }>();

    try {
      for (let page = 0; page < CATALOG_MAX_PAGES; page++) {
        const result = await paymentClient.search({
          options: {
            range: 'date_created',
            begin_date: since.toISOString(),
            end_date: syncedAt.toISOString(),
            limit: CATALOG_PAGE_SIZE,
            offset
          }
        });

        const results = result?.results ?? [];
        if (results.length === 0) break;

        for (const payment of results) {
          scanned++;
          const items = payment?.additional_info?.items ?? [];

          if (items.length === 0) {
            withoutItems++;
            continue;
          }
          withItems++;

          for (const item of items) {
            const name = item?.title?.trim();
            if (!name) continue;

            // `id` lo define quien integra el cobro y puede venir vacio. El
            // titulo es el fallback: es lo que identifica al producto para una
            // persona, y mantiene estable el matcheo entre sincronizaciones.
            const externalId = String(item.id ?? '').trim() || `title:${name.toLowerCase()}`;
            const price = Number(item.unit_price);

            found.set(externalId, {
              name,
              price: Number.isFinite(price) ? price : null
            });
          }
        }

        if (results.length < CATALOG_PAGE_SIZE) break;
        offset += CATALOG_PAGE_SIZE;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error consultando Mercado Pago';
      await this.dbRepository.update({
        entity: 'org_mp_account',
        where: { uuid: account.uuid },
        data: { status: 'error', lastErrorMessage: message.slice(0, 500) }
      });
      throw new BadRequestException(`No se pudo leer los pagos de Mercado Pago: ${message}`);
    }

    const { created, updated } = await this.upsertCatalogItems(account, found, syncedAt);

    await this.dbRepository.update({
      entity: 'org_mp_account',
      where: { uuid: account.uuid },
      data: { lastCatalogSyncAt: syncedAt, lastErrorMessage: null }
    });

    return {
      paymentsScanned: scanned,
      paymentsWithItems: withItems,
      paymentsWithoutItems: withoutItems,
      itemsCreated: created,
      itemsUpdated: updated,
      since,
      syncedAt
    };
  }

  /**
   * Upsert por `(cuenta, externalId)`: reimportar el mismo producto refresca su
   * nombre y precio en vez de duplicarlo. El indice unico de la tabla lo respalda.
   */
  private async upsertCatalogItems(
    account: OrgMpAccountEntity,
    found: Map<string, { name: string; price: number | null }>,
    syncedAt: Date
  ): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;

    for (const [externalId, data] of found) {
      const existing = (await this.dbRepository.findOne({
        entity: 'mp_catalog_item',
        where: { orgMpAccountUuid: account.uuid, externalId }
      })) as MpCatalogItemEntity | null;

      if (existing) {
        await this.dbRepository.update({
          entity: 'mp_catalog_item',
          where: { uuid: existing.uuid },
          data: { name: data.name, price: data.price, lastSyncAt: syncedAt, isDeleted: null }
        });
        updated++;
        continue;
      }

      const item = new MpCatalogItemEntity();
      item.uuid = uuidv4();
      item.organizationUuid = account.organizationUuid;
      item.orgMpAccountUuid = account.uuid;
      item.externalId = externalId;
      item.name = data.name;
      item.price = data.price;
      item.lastSyncAt = syncedAt;
      item.isDeleted = null;

      await this.dbRepository.create({ entity: 'mp_catalog_item', data: item });
      created++;
    }

    return { created, updated };
  }

  /**
   * Devuelve un access token utilizable, renovandolo si esta por vencer.
   *
   * El margen evita el caso borde de un token que vence en mitad de la
   * sincronizacion, que puede recorrer varias paginas de pagos.
   */
  private resolveUsableAccessToken(account: OrgMpAccountEntity): Promise<string> {
    return this.mpTokenService.resolveUsableAccessToken(account);
  }

  private async requireOwnAccount(
    loggedUser: string,
    accountUuid: string
  ): Promise<OrgMpAccountEntity> {
    const organization = await this.resolveOrganization(loggedUser);

    const account = (await this.dbRepository.findOne({
      entity: 'org_mp_account',
      where: { uuid: accountUuid, organizationUuid: organization.uuid, isDeleted: IsNull() }
    })) as OrgMpAccountEntity | null;

    if (!account) {
      throw new NotFoundException('La cuenta de Mercado Pago no existe o no es de tu productora');
    }

    return account;
  }
}
