import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { MercadoPagoConfig, Payment as MPPayment } from 'mercadopago';
import { DBRepository } from '@config/db/db.repository';
import { OrgMpAccountEntity } from '@config/db/entities/tickets/org_mp_account.entity';
import { MpMovementType } from '@config/db/entities/tickets/mp_movement.entity';
import { MpTokenService } from '@root/shared/mercadopago/mp-token.service';

/** Ventana de sincronización: inicio–fin del evento ±1 h (`BR-CASH-003`). */
const WINDOW_MARGIN_MS = 60 * 60 * 1000;

const PAGE_SIZE = 50;
/** Tope de páginas por cuenta y corrida: una cuenta con mucho volumen no debe
 *  monopolizar el worker. Lo que sobra entra en la corrida siguiente. */
const MAX_PAGES = 20;

type DuePair = {
  eventUuid: string;
  startDate: Date;
  endDate: Date;
  accountUuid: string;
};

type MpPaymentLike = {
  id?: number | string;
  status?: string;
  date_approved?: string | null;
  date_created?: string | null;
  transaction_amount?: number | null;
  transaction_amount_refunded?: number | null;
  payment_type_id?: string | null;
  additional_info?: { items?: unknown[] | null } | null;
};

type Classified = {
  type: MpMovementType;
  /** Bruto que entró por el pago. */
  amount: number;
  /** Parte devuelta o contracargada del mismo pago. */
  refundedAmount: number;
};

export type SyncRunResult = {
  eventsScanned: number;
  accountsScanned: number;
  movementsCreated: number;
  movementsUpdated: number;
  accountsFailed: number;
};

/**
 * Copia a la base los movimientos de las cuentas MP asignadas a un evento,
 * durante la ventana del evento (`BR-CASH-003`, `BR-CASH-004`, FP11 §5b).
 *
 * Reglas que condicionan el diseño:
 * - **Solo cuentas asignadas al evento** (`BR-CASH-010`). Sin asignación no se
 *   lee nada: los movimientos de la productora no son de ningún evento.
 * - **Idempotencia por id de MP**: el job corre cada ~5 min sobre ventanas que
 *   se solapan, así que la garantía es el índice único
 *   `(orgMpAccountUuid, mpPaymentId)`, no el código.
 * - **Fallo silencioso**: si una cuenta falla, se anota el motivo y se sigue
 *   con las demás. No se notifica al productor; se reintenta en la corrida
 *   siguiente.
 */
@Injectable()
export class MpSyncService {
  private readonly logger = new Logger(MpSyncService.name);

  constructor(
    private readonly dbRepository: DBRepository,
    private readonly dataSource: DataSource,
    private readonly mpTokenService: MpTokenService
  ) {}

  /**
   * Pares (evento, cuenta) que están dentro de la ventana en este momento.
   *
   * El filtro se hace en SQL con `NOW()` de MySQL: las fechas del evento se
   * guardan en hora local del servidor, y compararlas en JS obligaría a
   * reconstruir la zona horaria a mano.
   */
  private async findDuePairs(): Promise<DuePair[]> {
    const rows = await this.dataSource
      .createQueryBuilder()
      .select('e.uuid', 'eventUuid')
      .addSelect('e.startDate', 'startDate')
      .addSelect('e.endDate', 'endDate')
      .addSelect('a.uuid', 'accountUuid')
      .from('event_mp_account', 'ema')
      .innerJoin('event', 'e', 'e.uuid = ema.eventUuid')
      .innerJoin('org_mp_account', 'a', 'a.uuid = ema.orgMpAccountUuid')
      .where('ema.isDeleted IS NULL')
      .andWhere('a.isDeleted IS NULL')
      .andWhere("a.status = 'connected'")
      .andWhere('e.isActive = 1')
      .andWhere('NOW() >= DATE_SUB(e.startDate, INTERVAL 1 HOUR)')
      .andWhere('NOW() <= DATE_ADD(e.endDate, INTERVAL 1 HOUR)')
      .getRawMany<{ eventUuid: string; startDate: Date; endDate: Date; accountUuid: string }>();

    return rows.map(r => ({
      eventUuid: r.eventUuid,
      startDate: new Date(r.startDate),
      endDate: new Date(r.endDate),
      accountUuid: r.accountUuid
    }));
  }

  /**
   * Clasifica un pago según `FP11 §6`.
   *
   * El tipo describe **de dónde vino** la plata y no cambia cuando el pago se
   * devuelve: un pago devuelto entero sigue siendo posnet, con
   * `refundedAmount == amount`. Pisarle el tipo a `egreso_mp` haría que el
   * ingreso desapareciera de su cubeta y el resumen restara el doble.
   * `egreso_mp` queda para cuando el productor reclasifica a mano.
   *
   * Un pago aprobado con ítems es posnet con catálogo; sin ítems cae en la
   * cubeta Otros / Transferencias, que el productor puede completar.
   */
  private classify(payment: MpPaymentLike): Classified | null {
    const gross = Number(payment.transaction_amount ?? 0);
    const refundedRaw = Number(payment.transaction_amount_refunded ?? 0);
    const refunded = Number.isFinite(refundedRaw) && refundedRaw > 0 ? refundedRaw : 0;
    const status = String(payment.status ?? '');

    const fullyReturned = status === 'refunded' || status === 'charged_back';

    // Pendientes y rechazados no son plata que entró: se ignoran y, si después
    // se aprueban, entran en la corrida siguiente. Un pago devuelto sí se
    // registra aunque ya no esté aprobado: el egreso tiene que quedar.
    if (status !== 'approved' && !fullyReturned) return null;
    if (!(gross > 0)) return null;

    // `amount` es siempre lo que entró; lo devuelto va aparte. Si se guardara
    // solo el neto, resincronizar un pago devuelto lo haría desaparecer del
    // ingreso y aparecer como egreso, y el total se movería el doble.
    const base = {
      amount: gross,
      refundedAmount: fullyReturned ? gross : Math.min(refunded, gross)
    };

    const items = payment.additional_info?.items ?? [];
    if (Array.isArray(items) && items.length > 0) {
      return { type: 'posnet_catalogo', ...base };
    }

    const paymentType = String(payment.payment_type_id ?? '');
    if (paymentType === 'bank_transfer' || paymentType === 'account_money') {
      return { type: 'transferencia', ...base };
    }

    return { type: 'otro', ...base };
  }

  /**
   * Upsert por `(cuenta, mpPaymentId)`.
   *
   * `ON DUPLICATE KEY UPDATE` deja que el índice único resuelva la carrera: dos
   * corridas solapadas sobre el mismo pago terminan en una sola fila. El
   * `eventIncomeUuid` no se toca — si el productor ya completó el detalle, una
   * resincronización no puede borrarlo.
   */
  private async upsertMovement(
    pair: DuePair,
    mpPaymentId: string,
    classified: Classified,
    occurredAt: Date,
    rawItems: unknown
  ): Promise<'created' | 'updated'> {
    const result = await this.dataSource.query(
      'INSERT INTO mp_movement ' +
        '(uuid, eventUuid, orgMpAccountUuid, mpPaymentId, amount, refundedAmount, type, ' +
        'occurredAt, rawItems, isDeleted) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL) ' +
        'ON DUPLICATE KEY UPDATE ' +
        'amount = VALUES(amount), ' +
        'refundedAmount = VALUES(refundedAmount), ' +
        'type = VALUES(type), ' +
        'occurredAt = VALUES(occurredAt), ' +
        'rawItems = VALUES(rawItems)',
      [
        uuidv4(),
        pair.eventUuid,
        pair.accountUuid,
        mpPaymentId,
        classified.amount,
        classified.refundedAmount,
        classified.type,
        occurredAt,
        rawItems === null || rawItems === undefined ? null : JSON.stringify(rawItems)
      ]
    );

    // MySQL devuelve affectedRows = 1 en insert y 2 cuando actualizó una fila.
    return Number(result?.affectedRows ?? 1) >= 2 ? 'updated' : 'created';
  }

  /** Sincroniza una cuenta contra un evento. Devuelve cuántas filas tocó. */
  private async syncPair(pair: DuePair): Promise<{ created: number; updated: number }> {
    const account = (await this.dbRepository.findOne({
      entity: 'org_mp_account',
      where: { uuid: pair.accountUuid }
    })) as OrgMpAccountEntity | null;

    if (!account) return { created: 0, updated: 0 };

    const accessToken = await this.mpTokenService.resolveUsableAccessToken(account);
    const paymentClient = new MPPayment(new MercadoPagoConfig({ accessToken }));

    const from = new Date(pair.startDate.getTime() - WINDOW_MARGIN_MS);
    const until = new Date(Math.min(pair.endDate.getTime() + WINDOW_MARGIN_MS, Date.now()));

    let created = 0;
    let updated = 0;
    let offset = 0;

    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await paymentClient.search({
        options: {
          range: 'date_created',
          begin_date: from.toISOString(),
          end_date: until.toISOString(),
          limit: PAGE_SIZE,
          offset
        }
      });

      const results = (result?.results ?? []) as MpPaymentLike[];
      if (results.length === 0) break;

      for (const payment of results) {
        const mpPaymentId = String(payment?.id ?? '').trim();
        if (!mpPaymentId) continue;

        const classified = this.classify(payment);
        if (!classified) continue;

        const occurredAtRaw = payment.date_approved ?? payment.date_created;
        const occurredAt = occurredAtRaw ? new Date(occurredAtRaw) : new Date();

        const outcome = await this.upsertMovement(
          pair,
          mpPaymentId,
          classified,
          occurredAt,
          payment.additional_info?.items ?? null
        );
        if (outcome === 'created') created++;
        else updated++;
      }

      if (results.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    return { created, updated };
  }

  /**
   * Corrida completa: todos los eventos en ventana, todas sus cuentas.
   *
   * Nunca lanza. Un fallo de MP en una cuenta no puede cortar la sincronización
   * de las demás ni marcar el job como fallido (`BR-CASH-003`: fallo silencioso
   * con reintento en la corrida siguiente).
   */
  async syncDueEvents(): Promise<SyncRunResult> {
    const pairs = await this.findDuePairs();

    const summary: SyncRunResult = {
      eventsScanned: new Set(pairs.map(p => p.eventUuid)).size,
      accountsScanned: pairs.length,
      movementsCreated: 0,
      movementsUpdated: 0,
      accountsFailed: 0
    };

    for (const pair of pairs) {
      try {
        const { created, updated } = await this.syncPair(pair);
        summary.movementsCreated += created;
        summary.movementsUpdated += updated;

        if (created > 0 || updated > 0) {
          await this.dbRepository.update({
            entity: 'org_mp_account',
            where: { uuid: pair.accountUuid },
            data: { lastErrorMessage: null }
          });
        }
      } catch (error) {
        summary.accountsFailed++;
        const message = error instanceof Error ? error.message : 'Error consultando Mercado Pago';

        this.logger.warn(
          `Sync MP falló para evento=${pair.eventUuid} cuenta=${pair.accountUuid}: ${message}`
        );

        // Se anota el motivo en la cuenta para que el productor lo vea en
        // Cuentas MP, pero NO se cambia el status: un timeout puntual no
        // significa que la cuenta esté rota.
        await this.dbRepository
          .update({
            entity: 'org_mp_account',
            where: { uuid: pair.accountUuid },
            data: { lastErrorMessage: message.slice(0, 500) }
          })
          .catch(() => undefined);
      }
    }

    return summary;
  }
}
