import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import {
  MP_ACCOUNT_STATUSES,
  MpAccountStatus
} from '@config/db/entities/tickets/org_mp_account.entity';
import { IMpAccount } from '../../services/contracts/iorg-mp.service';

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

export class StartMpConnectResponse {
  @ApiProperty({
    description: 'URL de Mercado Pago a la que hay que redirigir al productor para autorizar.'
  })
  authorizationUrl: string;

  constructor(authorizationUrl: string) {
    this.authorizationUrl = authorizationUrl;
  }
}
