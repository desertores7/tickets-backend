import { MpAccountStatus } from '@config/db/entities/tickets/org_mp_account.entity';

export interface IMpAccount {
  uuid: string;
  alias: string;
  mpUserId: string;
  mpEmail: string | null;
  status: MpAccountStatus;
  liveMode: boolean;
  lastCatalogSyncAt: Date | null;
  lastErrorMessage: string | null;
  createdAt: Date;
}

/**
 * Resultado de recorrer los pagos de una cuenta buscando productos.
 *
 * `paymentsWithoutItems` no es un error: Mercado Pago no tiene catalogo, y un
 * posnet donde solo se tipea el monto no manda `additional_info.items`. Esos
 * pagos van a la cubeta Otros (`29` §6) y se cuentan para poder explicarle al
 * productor por que su catalogo quedo vacio.
 */
export interface ICatalogSyncResult {
  paymentsScanned: number;
  paymentsWithItems: number;
  paymentsWithoutItems: number;
  itemsCreated: number;
  itemsUpdated: number;
  since: Date;
  syncedAt: Date;
}

export interface IOrgMpService {
  /** Cuentas de la organización del usuario, incluidas las desconectadas. */
  listAccounts(loggedUser: string): Promise<IMpAccount[]>;

  /**
   * Devuelve la URL de autorización de MP a la que hay que mandar al productor.
   * El `state` viaja firmado para que el callback sepa a qué organización
   * corresponde sin confiar en el navegador.
   */
  startConnect(loggedUser: string): Promise<{ authorizationUrl: string }>;

  /** Callback del OAuth. Devuelve a dónde redirigir el navegador del productor. */
  completeConnect(code: string, state: string): Promise<{ redirectUrl: string }>;

  updateAlias(loggedUser: string, accountUuid: string, alias: string): Promise<IMpAccount>;

  /**
   * Recorre los pagos recientes de la cuenta y arma el catalogo con los
   * productos que aparezcan en `additional_info.items` (`BR-CASH-002`).
   * Manual: nunca corre solo.
   */
  syncCatalog(loggedUser: string, accountUuid: string): Promise<ICatalogSyncResult>;

  /** Marca la cuenta como desconectada; no borra el histórico (`BR-CASH-001`). */
  disconnect(loggedUser: string, accountUuid: string): Promise<void>;
}
