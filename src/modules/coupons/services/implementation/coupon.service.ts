import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource, In, IsNull } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DBRepository } from '@config/db/db.repository';
import { CouponEntity } from '@config/db/entities/tickets/coupon.entity';
import { EventEntity } from '@config/db/entities/tickets/event.entity';
import { CouponRedemptionEntity } from '@config/db/entities/tickets/coupon_redemption.entity';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { resolveListOrder } from '@root/shared/decorators/order-query.decorator';
import {
  COUPON_ORDER_COLUMNS,
  CouponStatusFilter
} from '../../controllers/const/coupon.filters';
import {
  ICoupon,
  ICouponApplication,
  ICouponLine,
  ICouponListResult,
  ICouponPayload,
  ICouponService,
  ICouponStatusTotal
} from '../contracts/icoupon.service';

@Injectable()
export class CouponService implements ICouponService {
  private readonly logger = new Logger(CouponService.name);

  constructor(
    private readonly dbRepository: DBRepository,
    private readonly dataSource: DataSource
  ) {}

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** El código se guarda y compara en mayúsculas: el comprador lo tipea como quiere. */
  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private async assertOwnsEvent(eventUuid: string, loggedUser: string): Promise<EventEntity> {
    const event = await this.dbRepository.findOne({ entity: 'event', where: { uuid: eventUuid } });
    if (!event) throw new NotFoundException('Evento no encontrado');

    // `BR-COUPON-004`: solo la productora dueña crea cupones de su evento.
    const membership = await this.dbRepository.findOne({
      entity: 'user_organization',
      where: {
        userUuid: loggedUser,
        organizationUuid: event.organizationUuid,
        isDeleted: IsNull()
      } as never
    });
    if (!membership) throw new NotFoundException('No tenés acceso a este evento');
    return event as EventEntity;
  }

  /**
   * Un cupón cuya vigencia cae fuera de la ventana de venta no sirve nunca: la
   * venta cierra al empezar el evento, así que una vigencia que arranca después
   * es una configuración muerta.
   *
   * Se rechaza al guardar en vez de dejarlo pasar: descubrirlo el día del
   * evento, con la promoción ya comunicada, es mucho peor.
   */
  private assertWithinSaleWindow(
    event: EventEntity,
    validFrom?: string | null,
    validUntil?: string | null
  ): void {
    const saleEnd = event.saleEndDate ? new Date(event.saleEndDate) : new Date(event.endDate);
    const saleStart = event.saleStartDate ? new Date(event.saleStartDate) : null;
    const cierre = new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(saleEnd);

    if (validFrom && new Date(validFrom) > saleEnd) {
      throw new BadRequestException(
        `La vigencia empieza después de que cierre la venta (${cierre}), así que el cupón no se podría usar nunca.`
      );
    }

    // Un 'hasta' posterior al cierre no rompe el cálculo, pero muestra en la
    // pantalla una vigencia que no es cierta: el cupón deja de servir cuando
    // cierra la venta, no en la fecha que dice. Se rechaza para que lo
    // configurado y lo real coincidan.
    if (validUntil && new Date(validUntil) > saleEnd) {
      throw new BadRequestException(
        `La vigencia no puede terminar después del cierre de venta (${cierre}): a partir de ahí el cupón deja de servir igual.`
      );
    }

    if (saleStart && validUntil && new Date(validUntil) < saleStart) {
      throw new BadRequestException(
        'La vigencia termina antes de que abra la venta, así que el cupón no se podría usar nunca.'
      );
    }
  }

  /**
   * Un cupón deja de servir por límite de usos o por fecha (`BR-COUPON-002`).
   * Se calcula al leer en vez de apagarlo con un job: así no depende de que
   * algo corra a tiempo y el resultado es siempre el correcto.
   */
  private isUsable(coupon: CouponEntity, now = new Date()): boolean {
    if (!coupon.active || coupon.isDeleted) return false;
    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) return false;
    if (coupon.validFrom && now < new Date(coupon.validFrom)) return false;
    if (coupon.validUntil && now > new Date(coupon.validUntil)) return false;
    return true;
  }

  private toCoupon(
    entity: CouponEntity,
    ticketTypeUuids: string[] = [],
    totalDiscountAmount = 0
  ): ICoupon {
    return {
      uuid: entity.uuid,
      eventUuid: entity.eventUuid,
      name: entity.name,
      code: entity.code,
      type: entity.type,
      value: Number(entity.value),
      maxUses: entity.maxUses,
      usedCount: Number(entity.usedCount),
      totalDiscountAmount,
      oncePerUser: Boolean(entity.oncePerUser),
      validFrom: entity.validFrom,
      validUntil: entity.validUntil,
      active: Boolean(entity.active),
      ticketTypeUuids,
      usable: this.isUsable(entity),
      createdAt: entity.createdAt
    };
  }

  /** Suma de descuentos por cupón (solo redenciones de órdenes pagadas). */
  private async sumDiscountsByCoupon(couponUuids: string[]): Promise<Map<string, number>> {
    const totals = new Map<string, number>();
    if (couponUuids.length === 0) return totals;

    const rows = (await this.dataSource.query(
      `SELECT couponUuid, COALESCE(SUM(discountAmount), 0) AS total
       FROM coupon_redemption
       WHERE couponUuid IN (${couponUuids.map(() => '?').join(',')})
       GROUP BY couponUuid`,
      couponUuids
    )) as Array<{ couponUuid: string; total: string | number }>;

    for (const row of rows) {
      totals.set(row.couponUuid, Number(row.total) || 0);
    }
    return totals;
  }

  /** MySQL devuelve ER_DUP_ENTRY (1062) al chocar contra un índice único. */
  private isDuplicateKey(err: unknown): boolean {
    const e = err as { code?: string; errno?: number; driverError?: { code?: string; errno?: number } };
    return (
      e?.code === 'ER_DUP_ENTRY' ||
      e?.errno === 1062 ||
      e?.driverError?.code === 'ER_DUP_ENTRY' ||
      e?.driverError?.errno === 1062
    );
  }

  private validatePayload(payload: Partial<ICouponPayload>): void {
    if (payload.value !== undefined) {
      if (payload.type === 'percent' && (payload.value < 1 || payload.value > 100)) {
        throw new BadRequestException('Un descuento en porcentaje debe estar entre 1 y 100');
      }
      if (payload.type === 'fixed' && payload.value <= 0) {
        throw new BadRequestException('El monto del descuento debe ser mayor a 0');
      }
    }
    if (payload.maxUses !== undefined && payload.maxUses !== null && payload.maxUses < 1) {
      throw new BadRequestException('El límite de usos debe ser al menos 1');
    }
    if (payload.validFrom && payload.validUntil) {
      if (new Date(payload.validUntil) <= new Date(payload.validFrom)) {
        throw new BadRequestException('La vigencia "hasta" debe ser posterior a "desde"');
      }
    }
  }

  /** Clasifica un cupón en uno de los 4 estados de UI del productor. */
  private resolveStatus(coupon: Pick<CouponEntity, 'active' | 'maxUses' | 'usedCount' | 'validUntil'>, now = new Date()): CouponStatusFilter {
    if (!coupon.active) return 'paused';
    if (coupon.maxUses !== null && Number(coupon.usedCount) >= coupon.maxUses) return 'exhausted';
    if (coupon.validUntil && now > new Date(coupon.validUntil)) return 'expired';
    return 'usable';
  }

  /** Condición SQL alineada con `resolveStatus` (prioridad: pausado → agotado → vencido → disponible). */
  private statusSql(alias: string, status: CouponStatusFilter): string {
    switch (status) {
      case 'paused':
        return `${alias}.active = 0`;
      case 'exhausted':
        return `${alias}.active = 1 AND ${alias}.maxUses IS NOT NULL AND ${alias}.usedCount >= ${alias}.maxUses`;
      case 'expired':
        return `${alias}.active = 1 AND (${alias}.maxUses IS NULL OR ${alias}.usedCount < ${alias}.maxUses) AND ${alias}.validUntil IS NOT NULL AND ${alias}.validUntil < NOW(3)`;
      case 'usable':
        return `${alias}.active = 1 AND (${alias}.maxUses IS NULL OR ${alias}.usedCount < ${alias}.maxUses) AND (${alias}.validUntil IS NULL OR ${alias}.validUntil >= NOW(3))`;
    }
  }

  // ── CRUD del productor ──────────────────────────────────────────────────────

  async listByEvent(
    eventUuid: string,
    loggedUser: string,
    opts?: Parameters<ICouponService['listByEvent']>[2]
  ): Promise<ICouponListResult> {
    await this.assertOwnsEvent(eventUuid, loggedUser);

    const page = Math.max(opts?.pagination?.page ?? 1, 1);
    const limit = opts?.pagination?.limit ?? 10;
    const type = opts?.filters?.type?.[0];
    const status = opts?.filters?.status?.[0] as CouponStatusFilter | undefined;
    const searchTerm = opts?.search?.search?.trim();

    const qb = this.dataSource
      .getRepository(CouponEntity)
      .createQueryBuilder('c')
      .where('c.eventUuid = :eventUuid', { eventUuid })
      .andWhere('c.isDeleted IS NULL');

    if (type) qb.andWhere('c.type = :type', { type });
    if (status && ['usable', 'paused', 'exhausted', 'expired'].includes(status)) {
      qb.andWhere(this.statusSql('c', status));
    }
    if (searchTerm) {
      qb.andWhere('(LOWER(c.name) LIKE :q OR LOWER(c.code) LIKE :q)', {
        q: `%${searchTerm.toLowerCase()}%`
      });
    }

    const order = resolveListOrder(opts?.order, COUPON_ORDER_COLUMNS, {
      createdAt: 'DESC',
      uuid: 'ASC'
    });
    for (const [col, dir] of Object.entries(order)) {
      qb.addOrderBy(`c.${col}`, dir);
    }

    const [rows, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const discountByCoupon = await this.sumDiscountsByCoupon(rows.map(c => c.uuid));
    const items = await Promise.all(
      rows.map(async c =>
        this.toCoupon(c, await this.getScopedTicketTypes(c.uuid), discountByCoupon.get(c.uuid) ?? 0)
      )
    );

    // Resumen del evento completo: no debe moverse con filtros/paginación.
    const all = (await this.dbRepository.findMany({
      entity: 'coupon',
      where: { eventUuid, isDeleted: IsNull() }
    })) as CouponEntity[];

    const statusCounts: Record<CouponStatusFilter, number> = {
      usable: 0,
      paused: 0,
      exhausted: 0,
      expired: 0
    };
    let totalUses = 0;
    for (const row of all) {
      statusCounts[this.resolveStatus(row)] += 1;
      totalUses += Number(row.usedCount) || 0;
    }
    const byStatus: ICouponStatusTotal[] = (
      Object.keys(statusCounts) as CouponStatusFilter[]
    ).map(s => ({ status: s, count: statusCounts[s] }));

    const discountRows = (await this.dataSource.query(
      `SELECT COALESCE(SUM(r.discountAmount), 0) AS total
       FROM coupon_redemption r
       INNER JOIN coupon c ON c.uuid = r.couponUuid
       WHERE c.eventUuid = ? AND c.isDeleted IS NULL`,
      [eventUuid]
    )) as Array<{ total: string | number }>;

    return {
      items,
      meta: new PaginationMetaResponse({ limit, page, total }),
      byStatus,
      totalDiscountAmount: Number(discountRows[0]?.total) || 0,
      totalUses,
      totalCoupons: all.length
    };
  }

  async create(
    eventUuid: string,
    payload: ICouponPayload,
    loggedUser: string
  ): Promise<ICoupon> {
    const event = await this.assertOwnsEvent(eventUuid, loggedUser);
    this.validatePayload(payload);
    this.assertWithinSaleWindow(event, payload.validFrom, payload.validUntil);

    const code = this.normalizeCode(payload.code);
    if (!code) throw new BadRequestException('El código no puede estar vacío');

    const existing = await this.dbRepository.findOne({
      entity: 'coupon',
      where: { eventUuid, code, isDeleted: IsNull() }
    });
    if (existing) throw new BadRequestException('Ya existe un cupón con ese código en este evento');

    const coupon = new CouponEntity();
    coupon.uuid = uuidv4();
    coupon.eventUuid = eventUuid;
    coupon.name = payload.name.trim();
    coupon.code = code;
    coupon.type = payload.type;
    coupon.value = payload.value;
    coupon.maxUses = payload.maxUses ?? null;
    coupon.usedCount = 0;
    coupon.oncePerUser = payload.oncePerUser ?? false;
    coupon.validFrom = payload.validFrom ? new Date(payload.validFrom) : null;
    coupon.validUntil = payload.validUntil ? new Date(payload.validUntil) : null;
    coupon.active = payload.active ?? true;
    coupon.isDeleted = null;

    try {
      await this.dbRepository.create({ entity: 'coupon', data: coupon });
    } catch (err) {
      // Defensa en profundidad: el chequeo previo puede perder una carrera
      // entre dos altas simultáneas. Sin esto, el choque del índice sale como
      // un 500 con el mensaje crudo de MySQL.
      if (this.isDuplicateKey(err)) {
        throw new BadRequestException('Ya existe un cupón con ese código en este evento');
      }
      throw err;
    }

    // `BR-COUPON-009`: sin tandas el cupón alcanza toda la compra.
    if (payload.ticketTypeUuids?.length) {
      await this.replaceScopedTicketTypes(coupon.uuid, eventUuid, payload.ticketTypeUuids);
    }

    return this.toCoupon(coupon, payload.ticketTypeUuids ?? []);
  }

  async update(
    eventUuid: string,
    couponUuid: string,
    payload: Partial<ICouponPayload>,
    loggedUser: string
  ): Promise<ICoupon> {
    const event = await this.assertOwnsEvent(eventUuid, loggedUser);
    const coupon = await this.requireOwnCoupon(eventUuid, couponUuid, loggedUser);
    this.validatePayload({ type: payload.type ?? coupon.type, ...payload });
    // Se valida con los valores que van a quedar: mover una sola de las dos
    // fechas puede dejar la ventana entera fuera de rango.
    this.assertWithinSaleWindow(
      event,
      payload.validFrom !== undefined ? payload.validFrom : coupon.validFrom?.toISOString() ?? null,
      payload.validUntil !== undefined ? payload.validUntil : coupon.validUntil?.toISOString() ?? null
    );

    const patch: Partial<CouponEntity> = {};
    if (payload.name !== undefined) patch.name = payload.name.trim();
    if (payload.type !== undefined) patch.type = payload.type;
    if (payload.value !== undefined) patch.value = payload.value;
    if (payload.maxUses !== undefined) patch.maxUses = payload.maxUses;
    if (payload.oncePerUser !== undefined) patch.oncePerUser = payload.oncePerUser;
    if (payload.active !== undefined) patch.active = payload.active;
    if (payload.validFrom !== undefined) {
      patch.validFrom = payload.validFrom ? new Date(payload.validFrom) : null;
    }
    if (payload.validUntil !== undefined) {
      patch.validUntil = payload.validUntil ? new Date(payload.validUntil) : null;
    }

    if (payload.code !== undefined) {
      const code = this.normalizeCode(payload.code);
      const clash = (await this.dbRepository.findOne({
        entity: 'coupon',
        where: { eventUuid, code, isDeleted: IsNull() }
      })) as CouponEntity | null;
      if (clash && clash.uuid !== couponUuid) {
        throw new BadRequestException('Ya existe un cupón con ese código en este evento');
      }
      patch.code = code;
    }

    await this.dbRepository.update({
      entity: 'coupon',
      where: { uuid: couponUuid },
      data: patch as never
    });

    if (payload.ticketTypeUuids !== undefined) {
      await this.replaceScopedTicketTypes(coupon.uuid, eventUuid, payload.ticketTypeUuids);
    }

    const discountByCoupon = await this.sumDiscountsByCoupon([coupon.uuid]);
    return this.toCoupon(
      { ...coupon, ...patch } as CouponEntity,
      await this.getScopedTicketTypes(coupon.uuid),
      discountByCoupon.get(coupon.uuid) ?? 0
    );
  }

  async remove(eventUuid: string, couponUuid: string, loggedUser: string): Promise<void> {
    const coupon = await this.requireOwnCoupon(eventUuid, couponUuid, loggedUser);

    // Baja lógica: las órdenes ya pagadas referencian el cupón.
    await this.dbRepository.update({
      entity: 'coupon',
      where: { uuid: couponUuid },
      data: {
        isDeleted: true,
        // El indice unico es (evento, codigo) y el borrado es logico: si el
        // codigo quedara ocupado, el productor no podria volver a usarlo nunca.
        // Se libera renombrandolo, conservando la fila para las ordenes pagadas.
        code: `${coupon.code.slice(0, 26)}.del.${uuidv4().slice(0, 8)}`
      } as never
    });
  }

  private async requireOwnCoupon(
    eventUuid: string,
    couponUuid: string,
    loggedUser: string
  ): Promise<CouponEntity> {
    await this.assertOwnsEvent(eventUuid, loggedUser);

    const coupon = (await this.dbRepository.findOne({
      entity: 'coupon',
      where: { uuid: couponUuid, eventUuid, isDeleted: IsNull() }
    })) as CouponEntity | null;

    if (!coupon) throw new NotFoundException('El cupón no existe en este evento');
    return coupon;
  }

  // ── Checkout (BR-COUPON-008) ────────────────────────────────────────────────

  /**
   * Aplica el cupón al subtotal.
   *
   * El orden importa y está fijado por `BR-COUPON-008`:
   * **(1) subtotal → (2) cupón → (3) fee 15% → (4) total**. Este método resuelve
   * el paso 2; el fee lo calcula quien crea la orden, sobre lo que devuelve acá.
   *
   * El descuento nunca deja el subtotal en negativo: un cupón fijo mayor que la
   * compra lo lleva a cero, no a un importe a favor.
   */
  async applyToSubtotal(
    eventUuid: string,
    code: string,
    lines: ICouponLine[],
    userUuid: string
  ): Promise<ICouponApplication> {
    const normalized = this.normalizeCode(code);

    const coupon = (await this.dbRepository.findOne({
      entity: 'coupon',
      where: { eventUuid, code: normalized, isDeleted: IsNull() }
    })) as CouponEntity | null;

    // Mismo mensaje para 'no existe' y 'no es de este evento': no hay razón
    // para confirmarle a alguien que un código existe en otro lado.
    if (!coupon) throw new BadRequestException('El cupón no es válido para este evento');

    const now = new Date();
    if (!coupon.active) throw new BadRequestException('Este cupón ya no está disponible');
    if (coupon.validFrom && now < new Date(coupon.validFrom)) {
      throw new BadRequestException('Este cupón todavía no está vigente');
    }
    if (coupon.validUntil && now > new Date(coupon.validUntil)) {
      throw new BadRequestException('Este cupón venció');
    }
    if (coupon.maxUses !== null && Number(coupon.usedCount) >= coupon.maxUses) {
      throw new BadRequestException('Este cupón alcanzó su límite de usos');
    }

    if (coupon.oncePerUser) {
      const previous = await this.dbRepository.findOne({
        entity: 'coupon_redemption',
        where: { couponUuid: coupon.uuid, userUuid } as never
      });
      if (previous) throw new BadRequestException('Ya usaste este cupón');
    }

    const subtotal = Math.round(lines.reduce((sum, l) => sum + l.subtotal, 0) * 100) / 100;

    // `BR-COUPON-009`: sin tandas asociadas el cupón alcanza toda la compra;
    // con tandas, el descuento se calcula solo sobre esas líneas.
    const scoped = await this.getScopedTicketTypes(coupon.uuid);
    const eligibleLines = scoped.length
      ? lines.filter(l => scoped.includes(l.ticketTypeUuid))
      : lines;

    if (scoped.length && eligibleLines.length === 0) {
      throw new BadRequestException(
        'Este cupón no aplica a las entradas que elegiste'
      );
    }

    const eligibleSubtotal =
      Math.round(eligibleLines.reduce((sum, l) => sum + l.subtotal, 0) * 100) / 100;

    const value = Number(coupon.value);
    const rawDiscount =
      coupon.type === 'percent' ? (eligibleSubtotal * value) / 100 : value;

    // El tope es el subtotal ELEGIBLE, no el total: un cupón fijo de $5000
    // limitado a una tanda de $500 descuenta $500, no toca el resto del carrito.
    const discountAmount = Math.round(Math.min(rawDiscount, eligibleSubtotal) * 100) / 100;
    const discountedSubtotal = Math.round((subtotal - discountAmount) * 100) / 100;

    return {
      couponUuid: coupon.uuid,
      name: coupon.name,
      code: coupon.code,
      subtotal,
      eligibleSubtotal,
      discountAmount,
      discountedSubtotal
    };
  }

  /**
   * Reemplaza las tandas alcanzadas por el cupón.
   *
   * Se valida que pertenezcan al evento: un cupón limitado a una tanda de otro
   * evento nunca aplicaría, y el productor no tendría cómo darse cuenta.
   */
  private async replaceScopedTicketTypes(
    couponUuid: string,
    eventUuid: string,
    ticketTypeUuids: string[]
  ): Promise<void> {
    await this.dataSource.query('DELETE FROM coupon_ticket_type WHERE couponUuid = ?', [couponUuid]);
    if (!ticketTypeUuids.length) return;

    const unique = [...new Set(ticketTypeUuids)];
    const owned = (await this.dbRepository.findMany({
      entity: 'ticket_type',
      where: { uuid: In(unique), eventUuid } as never,
      select: { uuid: true } as never
    })) as { uuid: string }[];

    if (owned.length !== unique.length) {
      throw new BadRequestException('Alguna de las tandas elegidas no pertenece a este evento');
    }

    for (const ticketTypeUuid of unique) {
      await this.dataSource.query(
        'INSERT INTO coupon_ticket_type (uuid, couponUuid, ticketTypeUuid) VALUES (?, ?, ?)',
        [uuidv4(), couponUuid, ticketTypeUuid]
      );
    }
  }

  /** Tandas alcanzadas por el cupón. Vacío = toda la compra. */
  private async getScopedTicketTypes(couponUuid: string): Promise<string[]> {
    const rows = (await this.dbRepository.findMany({
      entity: 'coupon_ticket_type',
      where: { couponUuid } as never
    })) as { ticketTypeUuid: string }[];
    return rows.map(r => r.ticketTypeUuid);
  }

  /**
   * Registra el uso. Se llama al confirmarse el pago: una orden que nunca se
   * paga no debe consumir un cupón ni contra el límite total ni contra el
   * "una vez por usuario".
   *
   * El índice único por orden hace que un webhook reintentado no cuente dos
   * veces; si ya estaba registrado, se ignora en silencio.
   */
  async redeem(
    couponUuid: string,
    orderUuid: string,
    userUuid: string,
    discountAmount: number
  ): Promise<void> {
    const already = await this.dbRepository.findOne({
      entity: 'coupon_redemption',
      where: { orderUuid } as never
    });
    if (already) return;

    const redemption = new CouponRedemptionEntity();
    redemption.uuid = uuidv4();
    redemption.couponUuid = couponUuid;
    redemption.orderUuid = orderUuid;
    redemption.userUuid = userUuid;
    redemption.discountAmount = discountAmount;

    try {
      await this.dbRepository.create({ entity: 'coupon_redemption', data: redemption });
      // Incremento atómico en la base: leer, sumar y escribir desde Node
      // permitiría que dos compras simultáneas dejaran el contador corto y
      // el cupón se usara de más.
      await this.dataSource.query(
        'UPDATE coupon SET usedCount = usedCount + 1 WHERE uuid = ?',
        [couponUuid]
      );
    } catch (err) {
      // El índice único puede rechazar una carrera entre dos webhooks: no es un
      // error del pago, ya está contado.
      this.logger.warn(`No se pudo registrar el uso del cupón ${couponUuid}: ${err}`);
    }
  }
}
