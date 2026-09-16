import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IsNull, Like } from 'typeorm';
import { DBRepository } from '@config/db/db.repository';
import { ChargebackEntity } from '@config/db/entities/tickets/chargeback.entity';
import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { AdminNotifierService } from '@root/shared/notifications/admin-notifier.service';
import { MercadoPagoService } from '@modules/payments/services/implementation/mercadopago.service';
import { v4 as uuidv4 } from 'uuid';

/** Estados de MP que dan la disputa por terminada. */
const CLOSED_STATUSES = ['closed', 'won', 'lost', 'settled', 'cancelled'];

export type TChargebackItem = {
  uuid: string;
  mpChargebackId: string;
  mpPaymentId: string | null;
  orderUuid: string | null;
  orderNumber: string | null;
  eventUuid: string | null;
  eventName: string | null;
  buyerName: string | null;
  buyerEmail: string | null;
  amount: number;
  currency: string;
  status: string;
  documentationRequired: boolean;
  documentationStatus: string | null;
  documentationDeadline: string | null;
  coverageApplied: boolean;
  internalNotes: string | null;
  receivedAt: string | null;
  closedAt: string | null;
};

export type TChargebackFilters = {
  status?: string;
  /** `1`/`true`: solo los que siguen abiertos. */
  open?: string;
  search?: string;
};

/**
 * Contracargos (`BR-SUPPORT-004`).
 *
 * Primera etapa del circuito: **enterarse y dejar constancia**. Mercado Pago
 * avisa por webhook, acá se guarda la disputa con su plazo y se le avisa al
 * Admin. Responder la evidencia sigue siendo manual desde el panel de MP; lo
 * que no puede pasar es que el contracargo llegue y nadie se entere, porque el
 * plazo corre igual y perderlo es plata descontada de la cuenta
 * (`BR-SUPPORT-005`).
 */
@Injectable()
export class ChargebackService {
  private readonly logger = new Logger(ChargebackService.name);

  constructor(
    @Inject(DBRepository) private readonly dbRepository: DBRepository,
    private readonly mercadoPagoService: MercadoPagoService,
    private readonly adminNotifier: AdminNotifierService
  ) {}

  /**
   * Trae el contracargo de MP y lo guarda. Es idempotente: el mismo aviso puede
   * llegar repetido y MP manda uno nuevo en cada cambio de estado.
   */
  async syncFromMercadoPago(mpChargebackId: string): Promise<void> {
    const remote = await this.mercadoPagoService.fetchChargeback(mpChargebackId);
    if (!remote) {
      this.logger.warn(`Contracargo ${mpChargebackId} sin datos en MP — se descarta`);
      return;
    }

    const existing = (await this.dbRepository.findOne({
      entity: 'chargeback',
      where: { mpChargebackId }
    })) as ChargebackEntity | null;

    // El pago nos lleva a la orden y al evento. Si no lo encontramos, la fila
    // se guarda igual: el aviso vale más que el vínculo.
    const link = await this.resolveOrder(remote.mpPaymentId);

    const closed = CLOSED_STATUSES.includes(remote.status.toLowerCase());
    const data = {
      mpChargebackId,
      mpPaymentId: remote.mpPaymentId,
      orderUuid: link?.orderUuid ?? existing?.orderUuid ?? null,
      eventUuid: link?.eventUuid ?? existing?.eventUuid ?? null,
      amount: remote.amount,
      currency: remote.currency,
      status: remote.status,
      documentationRequired: remote.documentationRequired,
      documentationStatus: remote.documentationStatus,
      documentationDeadline: remote.documentationDeadline,
      coverageApplied: remote.coverageApplied,
      rawResponse: remote.raw,
      receivedAt: existing?.receivedAt ?? remote.createdAt ?? new Date(),
      closedAt: closed ? (existing?.closedAt ?? new Date()) : null
    };

    if (existing) {
      await this.dbRepository.update({
        entity: 'chargeback',
        where: { uuid: existing.uuid },
        data
      });

      if (existing.status !== remote.status) {
        await this.notify(
          `Contracargo ${remote.status}`,
          `El contracargo ${mpChargebackId} pasó de "${existing.status}" a "${remote.status}".`
        );
      }
      return;
    }

    // `as` porque la fila nueva no trae las columnas que pone la base
    // (createdAt/updatedAt) ni las relaciones, que el tipo de la entidad exige.
    await this.dbRepository.create({
      entity: 'chargeback',
      data: { uuid: uuidv4(), internalNotes: null, ...data } as unknown as ChargebackEntity
    });

    const deadline = remote.documentationDeadline
      ? ` Hay que responder antes del ${remote.documentationDeadline.toLocaleDateString('es-AR')}.`
      : '';

    await this.notify(
      'Contracargo nuevo',
      `Un comprador disputó un pago de ${remote.currency} ${remote.amount}` +
        `${link?.orderNumber ? ` (orden ${link.orderNumber})` : ''}.` +
        `${remote.documentationRequired ? ' Mercado Pago pide documentación.' : ''}${deadline}`
    );
  }

  async list(
    filters: TChargebackFilters,
    pagination: IPaginationParams
  ): Promise<{ meta: PaginationMetaResponse; items: TChargebackItem[] }> {
    const where: Record<string, unknown> = {};
    if (filters.status) where.status = filters.status;
    if (filters.open === '1' || filters.open === 'true') where.closedAt = IsNull();
    if (filters.search?.trim()) where.mpChargebackId = Like(`%${filters.search.trim()}%`);

    const result = await this.dbRepository.findManyAndCount({
      entity: 'chargeback',
      where,
      relations: { order: { user: true }, event: true },
      other: {
        take: pagination.limit,
        skip: (pagination.page - 1) * pagination.limit,
        // Lo que sigue abierto primero: es el orden en que se trabaja.
        order: { closedAt: 'ASC', receivedAt: 'DESC' }
      }
    });

    return {
      meta: new PaginationMetaResponse({
        limit: pagination.limit,
        page: pagination.page,
        total: result.count
      }),
      items: result.items.map((row: unknown) => this.toItem(row))
    };
  }

  async getDetail(uuid: string): Promise<TChargebackItem> {
    const row = await this.dbRepository.findOne({
      entity: 'chargeback',
      where: { uuid },
      relations: { order: { user: true }, event: true }
    });
    if (!row) throw new NotFoundException('Contracargo no encontrado');
    return this.toItem(row);
  }

  /** Notas internas del equipo. Lo que informa MP no se toca desde acá. */
  async updateNotes(uuid: string, notes: string | null): Promise<TChargebackItem> {
    const row = await this.dbRepository.findOne({ entity: 'chargeback', where: { uuid } });
    if (!row) throw new NotFoundException('Contracargo no encontrado');

    await this.dbRepository.update({
      entity: 'chargeback',
      where: { uuid },
      data: { internalNotes: notes?.trim() || null }
    });

    return this.getDetail(uuid);
  }

  /** Cuántos siguen abiertos: es el número que importa mirar. */
  async countOpen(): Promise<number> {
    const result = await this.dbRepository.findManyAndCount({
      entity: 'chargeback',
      where: { closedAt: IsNull() },
      other: { take: 1 }
    });
    return result.count;
  }

  private async resolveOrder(
    mpPaymentId: string | null
  ): Promise<{ orderUuid: string; eventUuid: string | null; orderNumber: string | null } | null> {
    if (!mpPaymentId) return null;

    const payment = await this.dbRepository.findOne({
      entity: 'payment',
      where: { providerPaymentId: mpPaymentId },
      relations: { order: true }
    });

    if (!payment) {
      this.logger.warn(`Contracargo sobre un pago desconocido: mpPaymentId=${mpPaymentId}`);
      return null;
    }

    const row = payment as { orderUuid: string; order?: { eventUuid?: string; orderNumber?: string } };
    return {
      orderUuid: row.orderUuid,
      eventUuid: row.order?.eventUuid ?? null,
      orderNumber: row.order?.orderNumber ?? null
    };
  }

  private async notify(title: string, body: string): Promise<void> {
    await this.adminNotifier.notifyAdmins(title, body, {
      email: { actionPath: '/admin/chargebacks', actionLabel: 'Ver contracargos' }
    });
  }

  private toItem(raw: unknown): TChargebackItem {
    const row = raw as ChargebackEntity & {
      order?: { orderNumber?: string; user?: { firstName?: string; lastName?: string; email?: string } };
      event?: { name?: string };
    };
    const iso = (value: Date | string | null | undefined) =>
      value ? new Date(value).toISOString() : null;
    const user = row.order?.user;

    return {
      uuid: row.uuid,
      mpChargebackId: row.mpChargebackId,
      mpPaymentId: row.mpPaymentId ?? null,
      orderUuid: row.orderUuid ?? null,
      orderNumber: row.order?.orderNumber ?? null,
      eventUuid: row.eventUuid ?? null,
      eventName: row.event?.name ?? null,
      buyerName: user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || null : null,
      buyerEmail: user?.email ?? null,
      amount: Number(row.amount ?? 0),
      currency: row.currency ?? 'ARS',
      status: row.status,
      documentationRequired: Boolean(row.documentationRequired),
      documentationStatus: row.documentationStatus ?? null,
      documentationDeadline: iso(row.documentationDeadline),
      coverageApplied: Boolean(row.coverageApplied),
      internalNotes: row.internalNotes ?? null,
      receivedAt: iso(row.receivedAt),
      closedAt: iso(row.closedAt)
    };
  }
}
