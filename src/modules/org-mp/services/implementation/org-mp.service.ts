import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IsNull } from 'typeorm';
import { MercadoPagoConfig, OAuth } from 'mercadopago';
import { DBRepository } from '@config/db/db.repository';
import { EnvService } from '@config/env/env.service';
import { OrgMpAccountEntity } from '@config/db/entities/tickets/org_mp_account.entity';
import { OrganizationEntity } from '@config/db/entities/user/organization.entity';
import { ORGANIZATION_STATUS } from '@modules/organization/const/organization-status.const';
import { TokenCipher } from '@root/shared/crypto/token-cipher';
import { IMpAccount, IOrgMpService } from '../contracts/iorg-mp.service';

/** El `state` del OAuth vive poco: solo tiene que sobrevivir el viaje a MP. */
const STATE_TTL = '10m';

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
    private readonly jwt: JwtService
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
