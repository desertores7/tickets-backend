import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import {
  MP_ACCOUNT_STATUSES,
  MpAccountStatus
} from '@config/db/entities/tickets/org_mp_account.entity';
import { ICatalogSyncResult, IMpAccount } from '../../services/contracts/iorg-mp.service';

export class UpdateMpAccountRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @ApiProperty({ description: 'Alias interno de la cuenta', example: 'Barra norte' })
  alias: string;
}

/**
 * Nunca expone tokens: solo los datos que la vista necesita mostrar
 * (`29` §8b). El access token vive cifrado y no sale del backend.
 */
export class MpAccountResponse {
  @ApiProperty() uuid: string;
  @ApiProperty({ example: 'Barra norte' }) alias: string;
  @ApiProperty({ description: 'user_id de Mercado Pago' }) mpUserId: string;
  @ApiProperty({ nullable: true }) mpEmail: string | null;
  @ApiProperty({ enum: MP_ACCOUNT_STATUSES }) status: MpAccountStatus;

  @ApiProperty({ description: 'false = credenciales de prueba de Mercado Pago' })
  liveMode: boolean;

  @ApiProperty({ nullable: true, description: 'ISO-8601' })
  lastCatalogSyncAt: string | null;

  @ApiProperty({ nullable: true, description: 'Motivo del ultimo fallo, si status es error' })
  lastErrorMessage: string | null;

  @ApiProperty({ description: 'ISO-8601' }) createdAt: string;

  constructor(data: IMpAccount) {
    this.uuid = data.uuid;
    this.alias = data.alias;
    this.mpUserId = data.mpUserId;
    this.mpEmail = data.mpEmail;
    this.status = data.status;
    this.liveMode = data.liveMode;
    this.lastCatalogSyncAt = data.lastCatalogSyncAt ? data.lastCatalogSyncAt.toISOString() : null;
    this.lastErrorMessage = data.lastErrorMessage;
    this.createdAt = data.createdAt.toISOString();
  }
}

export class MpAccountsResponse {
  @ApiProperty({ type: [MpAccountResponse] })
  items: MpAccountResponse[];

  constructor(items: MpAccountResponse[]) {
    this.items = items;
  }
}

/**
 * Resumen de la sincronizacion. Los contadores existen para poder explicarle al
 * productor por que su catalogo quedo vacio: Mercado Pago no tiene catalogo de
 * productos, y un posnet donde solo se tipea el monto no manda items.
 */
export class SyncCatalogResponse {
  @ApiProperty({ description: 'Pagos revisados en la ventana' }) paymentsScanned: number;
  @ApiProperty({ description: 'Pagos que traian detalle de productos' }) paymentsWithItems: number;

  @ApiProperty({
    description: 'Pagos sin detalle. No es un error: van a la cubeta Otros (`29` §6).'
  })
  paymentsWithoutItems: number;

  @ApiProperty() itemsCreated: number;
  @ApiProperty() itemsUpdated: number;
  @ApiProperty({ description: 'Inicio de la ventana revisada, ISO-8601' }) since: string;
  @ApiProperty({ description: 'ISO-8601' }) syncedAt: string;

  constructor(data: ICatalogSyncResult) {
    this.paymentsScanned = data.paymentsScanned;
    this.paymentsWithItems = data.paymentsWithItems;
    this.paymentsWithoutItems = data.paymentsWithoutItems;
    this.itemsCreated = data.itemsCreated;
    this.itemsUpdated = data.itemsUpdated;
    this.since = data.since.toISOString();
    this.syncedAt = data.syncedAt.toISOString();
  }
}

export class StartMpConnectResponse {
  @ApiProperty({
    description: 'URL de Mercado Pago a la que hay que redirigir al productor para autorizar.'
  })
  authorizationUrl: string;

  constructor(authorizationUrl: string) {
    this.authorizationUrl = authorizationUrl;
  }
}
