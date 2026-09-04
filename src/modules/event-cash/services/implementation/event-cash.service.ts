import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, In, IsNull } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DBRepository } from '@config/db/db.repository';
import { EventIncomeEntity } from '@config/db/entities/tickets/event_income.entity';
import { EventIncomeProductEntity } from '@config/db/entities/tickets/event_income_product.entity';
import { MpMovementEntity } from '@config/db/entities/tickets/mp_movement.entity';
import {
  ICashSummary,
  IEventMpAccount,
  ICreateIncomePayload,
  ICashOperationalIncome,
  IEventCashService,
  IListIncomesOpts,
  IListIncomesResult,
  IMpMovement,
  IMpMovementItem,
  IUpdateMpMovementPayload,
  IIncome,
  IIncomeProduct,
  IIncomeProductPayload
} from '../contracts/ievent-cash.service';

/** Quién está operando la caja de este evento. */
type CashAccess = { role: 'producer' | 'cashier'; organizationUuid: string };

@Injectable()
export class EventCashService implements IEventCashService {
  constructor(
    private readonly dbRepository: DBRepository,
    private readonly dataSource: DataSource
  ) {}

  // ── Acceso ──────────────────────────────────────────────────────────────────

  /**
   * Resuelve el rol operativo sobre el evento.
   *
   * Miembro de la organización dueña => Productor: CRUD completo.
   * Asignado como Caja a ESE evento => solo alta y lectura (`BR-CASH-014`).
   */
  private async resolveAccess(eventUuid: string, userUuid: string): Promise<CashAccess> {
    const event = await this.dbRepository.findOne({ entity: 'event', where: { uuid: eventUuid } });
    if (!event) throw new NotFoundException('Evento no encontrado');

    // El rol se mira explícitamente y no por la membresía a la organización:
    // un usuario Caja creado desde el staff TAMBIÉN es miembro de la org, así
    // que resolverlo por membresía le daba permisos de Productor.
    const roles = (await this.dbRepository.findMany({
      entity: 'user_role',
      where: { userUuid, isDeleted: IsNull() } as never,
      relations: { role: true } as never
    })) as { role?: { name?: string } }[];
    const roleNames = roles.map(r => r.role?.name).filter(Boolean) as string[];

    const membership = await this.dbRepository.findOne({
      entity: 'user_organization',
      where: {
        userUuid,
        organizationUuid: event.organizationUuid,
        isDeleted: IsNull()
      } as never
    });

    // El Administrador opera cualquier evento con permisos de Productor.
    if (roleNames.includes('Administrador')) {
      return { role: 'producer', organizationUuid: event.organizationUuid };
    }

    if (roleNames.includes('Caja')) {
      const assigned = await this.dbRepository.findOne({
        entity: 'user_event_cashier',
        where: { userUuid, eventUuid, isDeleted: IsNull() } as never
      });
      if (!assigned) {
        throw new ForbiddenException('No estás asignado a la caja de este evento');
      }
      return { role: 'cashier', organizationUuid: event.organizationUuid };
    }

    if (membership) return { role: 'producer', organizationUuid: event.organizationUuid };

    throw new ForbiddenException('No tenés acceso a la caja de este evento');
  }

  /** El mensaje nombra la acción concreta: 'no podés editar' cuando quisiste
   *  ver el resumen confunde a quien lo lee. */
  private assertProducer(access: CashAccess, accion: string): void {
    if (access.role !== 'producer') {
      throw new ForbiddenException(`Solo el productor puede ${accion}`);
    }
  }

  // ── Lectura ─────────────────────────────────────────────────────────────────

  private toIncome(
    entity: EventIncomeEntity & { creator?: { firstName?: string; lastName?: string } },
    products: EventIncomeProductEntity[]
  ): IIncome {
    const creator = entity.creator
      ? `${entity.creator.firstName ?? ''} ${entity.creator.lastName ?? ''}`.trim()
      : null;

    return {
      uuid: entity.uuid,
      eventUuid: entity.eventUuid,
      source: entity.source,
      method: entity.method,
      occurredAt: entity.occurredAt,
      notes: entity.notes,
      total: Number(entity.total),
      createdBy: entity.createdBy,
      createdByName: creator || null,
      products: products.map(p => ({
        uuid: p.uuid,
        type: p.type,
        referenceUuid: p.referenceUuid,
        name: p.name,
        quantity: Number(p.quantity),
        unitPrice: Number(p.unitPrice),
        subtotal: Number(p.subtotal)
      })),
      createdAt: entity.createdAt
    };
  }

  /** Recarga el nombre de quien registró el cobro (create/update no traen la relación). */
  private async resolveCreatorName(createdBy: string | null): Promise<{
    firstName?: string;
    lastName?: string;
  } | undefined> {
    if (!createdBy) return undefined;
    const user = (await this.dbRepository.findOne({
      entity: 'user',
      where: { uuid: createdBy } as never,
      select: { firstName: true, lastName: true } as never
    })) as { firstName?: string; lastName?: string } | null;
    return user ?? undefined;
  }

  async listIncomes(
    eventUuid: string,
    loggedUser: string,
    opts?: IListIncomesOpts
  ): Promise<IListIncomesResult> {
    await this.resolveAccess(eventUuid, loggedUser);

    const page = Math.max(opts?.page ?? 1, 1);
    const limit = Math.min(Math.max(opts?.limit ?? 10, 1), 100);
    const searchTerm = opts?.search?.trim();
    const method = opts?.method;
    const orderBy = opts?.orderBy === 'total' ? 'total' : 'occurredAt';
    const orderDir = opts?.orderDir === 'ASC' ? 'ASC' : 'DESC';

    const qb = this.dataSource
      .getRepository(EventIncomeEntity)
      .createQueryBuilder('income')
      .leftJoinAndSelect('income.creator', 'creator')
      .where('income.eventUuid = :eventUuid', { eventUuid })
      .andWhere('income.isDeleted IS NULL');

    if (method) {
      qb.andWhere('income.method = :method', { method });
    }

    if (searchTerm) {
      // Notas, nombre de producto o quién cobró — mismo patrón de search
      // que gastos (parcial), ampliado a relaciones útiles del cobro.
      qb.andWhere(
        `(income.notes LIKE :q
          OR CONCAT(COALESCE(creator.firstName, ''), ' ', COALESCE(creator.lastName, '')) LIKE :q
          OR EXISTS (
            SELECT 1 FROM event_income_product p
            WHERE p.eventIncomeUuid = income.uuid AND p.name LIKE :q
          ))`,
        { q: `%${searchTerm}%` }
      );
    }

    qb.orderBy(`income.${orderBy}`, orderDir).addOrderBy('income.uuid', 'ASC');
    qb.skip((page - 1) * limit).take(limit);

    const [incomes, count] = await qb.getManyAndCount();

    let productsByIncome = new Map<string, EventIncomeProductEntity[]>();
    if (incomes.length) {
      const products = (await this.dbRepository.findMany({
        entity: 'event_income_product',
        where: { eventIncomeUuid: In(incomes.map(i => i.uuid)) } as never
      })) as EventIncomeProductEntity[];

      productsByIncome = new Map();
      for (const p of products) {
        const list = productsByIncome.get(p.eventIncomeUuid) ?? [];
        list.push(p);
        productsByIncome.set(p.eventIncomeUuid, list);
      }
    }

    // Total del evento completo (sin filtros): alimenta KPIs laterales.
    const allForTotal = (await this.dbRepository.findMany({
      entity: 'event_income',
      where: { eventUuid, isDeleted: IsNull() } as never,
      select: { uuid: true, total: true } as never
    })) as Pick<EventIncomeEntity, 'uuid' | 'total'>[];

    const grandTotal =
      Math.round(allForTotal.reduce((s, row) => s + Number(row.total), 0) * 100) / 100;

    return {
      items: incomes.map(i => this.toIncome(i, productsByIncome.get(i.uuid) ?? [])),
      meta: { limit, page, total: count },
      total: grandTotal
    };
  }
  // ── Alta ────────────────────────────────────────────────────────────────────

  /**
   * Resuelve el nombre del producto según su tipo.
   *
   * Se guarda como **foto**: el catálogo puede cambiar de precio o nombre
   * después, y las ventas ya registradas no deben moverse (`BR-CASH-002`).
   */
  private async resolveProductName(
    eventUuid: string,
    organizationUuid: string,
    item: IIncomeProductPayload
  ): Promise<string> {
    if (item.type === 'otros') {
      return item.name?.trim() || 'Otros';
    }

    if (!item.referenceUuid) {
      throw new BadRequestException('Falta indicar qué producto se vendió');
    }

    if (item.type === 'entrada') {
      const tanda = await this.dbRepository.findOne({
        entity: 'ticket_type',
        where: { uuid: item.referenceUuid, eventUuid } as never
      });
      if (!tanda) throw new BadRequestException('La tanda no pertenece a este evento');
      return tanda.name;
    }

    if (item.type === 'manual') {
      const manual = await this.dbRepository.findOne({
        entity: 'org_manual_item',
        where: { uuid: item.referenceUuid, organizationUuid, isDeleted: IsNull() } as never
      });
      if (!manual) throw new BadRequestException('El ítem no es del catálogo de tu productora');
      return manual.name;
    }

    const mp = await this.dbRepository.findOne({
      entity: 'mp_catalog_item',
      where: { uuid: item.referenceUuid, organizationUuid, isDeleted: IsNull() } as never
    });
    if (!mp) throw new BadRequestException('El producto no es del catálogo de Mercado Pago');
    return mp.name;
  }

  private validateProducts(products: IIncomeProductPayload[]): void {
    if (!products.length) {
      throw new BadRequestException('El ingreso tiene que tener al menos un producto');
    }
    for (const p of products) {
      if (!Number.isFinite(p.quantity) || p.quantity <= 0) {
        throw new BadRequestException('La cantidad debe ser mayor a 0');
      }
      if (!Number.isFinite(p.unitPrice) || p.unitPrice < 0) {
        throw new BadRequestException('El precio no puede ser negativo');
      }
    }
  }

  async createIncome(
    eventUuid: string,
    payload: ICreateIncomePayload,
    loggedUser: string
  ): Promise<IIncome> {
    const access = await this.resolveAccess(eventUuid, loggedUser);
    this.validateProducts(payload.products);

    const resolved: EventIncomeProductEntity[] = [];
    let total = 0;

    const incomeUuid = uuidv4();
    for (const item of payload.products) {
      const name = await this.resolveProductName(eventUuid, access.organizationUuid, item);
      const subtotal = Math.round(item.quantity * item.unitPrice * 100) / 100;
      total += subtotal;

      const product = new EventIncomeProductEntity();
      product.uuid = uuidv4();
      product.eventIncomeUuid = incomeUuid;
      product.type = item.type;
      product.referenceUuid = item.referenceUuid ?? null;
      product.name = name;
      product.quantity = item.quantity;
      product.unitPrice = item.unitPrice;
      product.subtotal = subtotal;
      resolved.push(product);
    }

    const income = new EventIncomeEntity();
    income.uuid = incomeUuid;
    income.eventUuid = eventUuid;
    income.source = 'manual';
    income.method = payload.method;
    income.occurredAt = payload.occurredAt ? new Date(payload.occurredAt) : new Date();
    income.notes = payload.notes ?? null;
    income.total = Math.round(total * 100) / 100;
    income.createdBy = loggedUser;
    income.isDeleted = null;

    // El ingreso y sus productos van juntos: un ingreso sin líneas no tiene
    // sentido y su total quedaría en cero.
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.manager.save(EventIncomeEntity, income);
      await queryRunner.manager.save(EventIncomeProductEntity, resolved);
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    const creator = await this.resolveCreatorName(income.createdBy);
    return this.toIncome({ ...income, creator } as EventIncomeEntity & {
      creator?: { firstName?: string; lastName?: string };
    }, resolved);
  }
  // ── Edición y baja (solo Productor, BR-CASH-014) ────────────────────────────

  async updateIncome(
    eventUuid: string,
    incomeUuid: string,
    payload: Partial<ICreateIncomePayload>,
    loggedUser: string
  ): Promise<IIncome> {
    const access = await this.resolveAccess(eventUuid, loggedUser);
    this.assertProducer(access, 'editar ingresos');

    const income = (await this.dbRepository.findOne({
      entity: 'event_income',
      where: { uuid: incomeUuid, eventUuid, isDeleted: IsNull() }
    })) as EventIncomeEntity | null;
    if (!income) throw new NotFoundException('El ingreso no existe en este evento');

    const patch: Partial<EventIncomeEntity> = {};
    if (payload.method !== undefined) patch.method = payload.method;
    if (payload.notes !== undefined) patch.notes = payload.notes;
    if (payload.occurredAt !== undefined) patch.occurredAt = new Date(payload.occurredAt);

    let products = (await this.dbRepository.findMany({
      entity: 'event_income_product',
      where: { eventIncomeUuid: incomeUuid } as never
    })) as EventIncomeProductEntity[];

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      if (payload.products !== undefined) {
        this.validateProducts(payload.products);

        // Se reemplazan todas: editar línea por línea obligaría a identificar
        // cuáles cambiaron, y el ingreso es una unidad, no un carrito editable.
        await queryRunner.manager.delete(EventIncomeProductEntity, { eventIncomeUuid: incomeUuid });

        const nuevos: EventIncomeProductEntity[] = [];
        let total = 0;
        for (const item of payload.products) {
          const name = await this.resolveProductName(eventUuid, access.organizationUuid, item);
          const subtotal = Math.round(item.quantity * item.unitPrice * 100) / 100;
          total += subtotal;

          const product = new EventIncomeProductEntity();
          product.uuid = uuidv4();
          product.eventIncomeUuid = incomeUuid;
          product.type = item.type;
          product.referenceUuid = item.referenceUuid ?? null;
          product.name = name;
          product.quantity = item.quantity;
          product.unitPrice = item.unitPrice;
          product.subtotal = subtotal;
          nuevos.push(product);
        }

        await queryRunner.manager.save(EventIncomeProductEntity, nuevos);
        patch.total = Math.round(total * 100) / 100;
        products = nuevos;
      }

      await queryRunner.manager.update(EventIncomeEntity, { uuid: incomeUuid }, patch);
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    const merged = { ...income, ...patch } as EventIncomeEntity;
    const creator = await this.resolveCreatorName(merged.createdBy);
    return this.toIncome({ ...merged, creator } as EventIncomeEntity & {
      creator?: { firstName?: string; lastName?: string };
    }, products);
  }

  async deleteIncome(
    eventUuid: string,
    incomeUuid: string,
    loggedUser: string
  ): Promise<void> {
    const access = await this.resolveAccess(eventUuid, loggedUser);
    this.assertProducer(access, 'borrar ingresos');

    const income = await this.dbRepository.findOne({
      entity: 'event_income',
      where: { uuid: incomeUuid, eventUuid, isDeleted: IsNull() }
    });
    if (!income) throw new NotFoundException('El ingreso no existe en este evento');

    // Borrado FÍSICO por spec (`BR-CASH-014`): un cobro mal cargado en la puerta
    // se elimina, no se archiva. Los productos caen por el ON DELETE CASCADE.
    await this.dataSource.query('DELETE FROM event_income WHERE uuid = ?', [incomeUuid]);
  }

  // ── Resumen (§5a / BR-CASH-007) ─────────────────────────────────────────────

  /**
   * KPIs de la caja del evento.
   *
   * Todo se calcula con consultas agregadas: es una pantalla de consulta y no
   * tiene sentido traer las filas a memoria para sumarlas acá.
   *
   * Solo el Productor (`29` §5a): la Caja carga y ve ingresos, pero no el
   * resultado del evento.
   */
  async getSummary(eventUuid: string, loggedUser: string): Promise<ICashSummary> {
    const access = await this.resolveAccess(eventUuid, loggedUser);
    this.assertProducer(access, 'ver el resumen de caja');

    const num = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;

    const [web, expenses, byUser, topProducts, operational] = await Promise.all([
      // Entradas web SIN costo de servicio: se suma oi.subtotal, nunca o.total.
      this.dataSource
        .createQueryBuilder()
        .select('COALESCE(SUM(oi.subtotal), 0)', 'v')
        .from('order_item', 'oi')
        .innerJoin('orders', 'o', 'o.uuid = oi.orderUuid')
        .where('o.eventUuid = :eventUuid', { eventUuid })
        .andWhere("o.status IN ('paid', 'refunded')")
        .getRawOne<{ v: string }>(),

      this.dataSource
        .createQueryBuilder()
        .select('COALESCE(SUM(ex.totalAmount), 0)', 'v')
        .from('event_expense', 'ex')
        .where('ex.eventUuid = :eventUuid', { eventUuid })
        .andWhere('ex.isDeleted IS NULL')
        .getRawOne<{ v: string }>(),

      // Quién cobró cuánto (BR-CASH-013).
      this.dataSource
        .createQueryBuilder()
        .select('i.createdBy', 'userUuid')
        .addSelect("CONCAT(u.firstName, ' ', u.lastName)", 'name')
        .addSelect('COALESCE(SUM(i.total), 0)', 'total')
        .from('event_income', 'i')
        .leftJoin('user', 'u', 'u.uuid = i.createdBy')
        .where('i.eventUuid = :eventUuid', { eventUuid })
        .andWhere('i.isDeleted IS NULL')
        // Un ingreso `mp_auto` no lo cobró nadie en puerta: es el desglose de
        // un cobro por posnet, y atribuirlo al productor que lo completó
        // falsearía quién cobró (BR-CASH-013).
        .andWhere("i.source = 'manual'")
        .groupBy('i.createdBy')
        .addGroupBy('name')
        .orderBy('total', 'DESC')
        .getRawMany<{ userUuid: string; name: string; total: string }>(),

      this.dataSource
        .createQueryBuilder()
        .select('p.name', 'name')
        .addSelect('COALESCE(SUM(p.quantity), 0)', 'quantity')
        .addSelect('COALESCE(SUM(p.subtotal), 0)', 'total')
        .from('event_income_product', 'p')
        .innerJoin('event_income', 'i', 'i.uuid = p.eventIncomeUuid')
        .where('i.eventUuid = :eventUuid', { eventUuid })
        .andWhere('i.isDeleted IS NULL')
        .groupBy('p.name')
        .orderBy('total', 'DESC')
        .limit(10)
        .getRawMany<{ name: string; quantity: string; total: string }>(),

      this.getOperationalIncome([eventUuid])
    ]);

    const webTickets = num(web?.v);
    const expensesTotal = num(expenses?.v);

    // BR-CASH-007: web + operativos − egresos MP. El neto operativo lo calcula
    // `getOperationalIncome`, que es el mismo que usa el dashboard.
    const totalIncome = num(webTickets + operational.total);

    return {
      webTickets,
      doorTickets: operational.doorTickets,
      mpIncome: operational.mpIncome,
      transfersAndOthers: operational.transfersAndOthers,
      manualIncome: operational.manualIncome,
      mpRefunds: operational.mpRefunds,
      totalIncome,
      expenses: expensesTotal,
      result: num(totalIncome - expensesTotal),
      currency: 'ARS',
      byUser: byUser.map(r => ({
        userUuid: r.userUuid,
        name: r.name?.trim() || 'Sin identificar',
        total: num(r.total)
      })),
      topProducts: topProducts.map(r => ({
        name: r.name,
        quantity: num(r.quantity),
        total: num(r.total)
      })),
      mpSyncAvailable: true
    };
  }

  /**
   * Ingresos operativos de uno o varios eventos (`BR-CASH-007`).
   *
   * Vive acá y no en reporting porque es la misma cuenta que el resumen de caja:
   * tenerla dos veces garantiza que en algún momento den distinto. **No valida
   * permisos**: quien la llama ya resolvió qué eventos puede ver.
   *
   * `eventUuids` en `null` significa "todos" — lo usa el Administrador.
   */
  async getOperationalIncome(
    eventUuids: string[] | null,
    filters?: { dateFrom?: string; dateTo?: string }
  ): Promise<ICashOperationalIncome> {
    const empty: ICashOperationalIncome = {
      doorTickets: 0,
      doorTicketsManual: 0,
      mpIncome: 0,
      transfersAndOthers: 0,
      manualIncome: 0,
      mpRefunds: 0,
      total: 0
    };
    if (eventUuids !== null && eventUuids.length === 0) return empty;

    const num = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;

    const incomeQb = this.dataSource
      .createQueryBuilder()
      // Entradas de puerta de cualquier origen: es el KPI que se muestra.
      .select("COALESCE(SUM(CASE WHEN p.type = 'entrada' THEN p.subtotal ELSE 0 END), 0)", 'door')
      // Las mismas, pero solo las cargadas a mano. Es el que entra al total:
      // lo detallado sobre un movimiento MP ya viene contado en `mpIncome`, y
      // sumarlo otra vez duplicaría la plata.
      .addSelect(
        "COALESCE(SUM(CASE WHEN p.type = 'entrada' AND i.source = 'manual' THEN p.subtotal ELSE 0 END), 0)",
        'doorManual'
      )
      .addSelect(
        "COALESCE(SUM(CASE WHEN p.type != 'entrada' AND i.source = 'manual' THEN p.subtotal ELSE 0 END), 0)",
        'manual'
      )
      .from('event_income_product', 'p')
      .innerJoin('event_income', 'i', 'i.uuid = p.eventIncomeUuid')
      .where('i.isDeleted IS NULL');

    const movementQb = this.dataSource
      .createQueryBuilder()
      // Una devolución se anota sobre el pago original, no como pago aparte:
      // por eso el egreso sale de `refundedAmount` y no de cambiarle el tipo a
      // la fila. `egreso_mp` solo aparece si el productor la reclasificó, y
      // entonces el egreso es el monto entero.
      .select(
        "COALESCE(SUM(CASE WHEN m.type = 'egreso_mp' THEN m.amount ELSE m.refundedAmount END), 0)",
        'refunds'
      )
      .addSelect(
        "COALESCE(SUM(CASE WHEN m.type = 'posnet_catalogo' THEN m.amount ELSE 0 END), 0)",
        'posnet'
      )
      .addSelect(
        "COALESCE(SUM(CASE WHEN m.type IN ('transferencia', 'otro') THEN m.amount ELSE 0 END), 0)",
        'others'
      )
      .from('mp_movement', 'm')
      .where('m.isDeleted IS NULL');

    if (eventUuids) {
      incomeQb.andWhere('i.eventUuid IN (:...eventUuids)', { eventUuids });
      movementQb.andWhere('m.eventUuid IN (:...eventUuids)', { eventUuids });
    }
    // El corte es por cuándo entró la plata, no por cuándo se cargó.
    if (filters?.dateFrom) {
      incomeQb.andWhere('i.occurredAt >= :from', { from: `${filters.dateFrom} 00:00:00` });
      movementQb.andWhere('m.occurredAt >= :from', { from: `${filters.dateFrom} 00:00:00` });
    }
    if (filters?.dateTo) {
      incomeQb.andWhere('i.occurredAt <= :to', { to: `${filters.dateTo} 23:59:59` });
      movementQb.andWhere('m.occurredAt <= :to', { to: `${filters.dateTo} 23:59:59` });
    }

    const [income, movements] = await Promise.all([
      incomeQb.getRawOne<{ door: string; doorManual: string; manual: string }>(),
      movementQb.getRawOne<{ refunds: string; posnet: string; others: string }>()
    ]);

    const doorTicketsManual = num(income?.doorManual);
    const manualIncome = num(income?.manual);
    const mpIncome = num(movements?.posnet);
    const transfersAndOthers = num(movements?.others);
    const mpRefunds = num(movements?.refunds);

    return {
      doorTickets: num(income?.door),
      doorTicketsManual,
      mpIncome,
      transfersAndOthers,
      manualIncome,
      mpRefunds,
      total: num(doorTicketsManual + manualIncome + mpIncome + transfersAndOthers - mpRefunds)
    };
  }

  // ── Cuentas MP del evento (§4 / BR-CASH-010) ────────────────────────────────

  async listMpAccounts(eventUuid: string, loggedUser: string): Promise<IEventMpAccount[]> {
    const access = await this.resolveAccess(eventUuid, loggedUser);
    this.assertProducer(access, 'ver las cuentas de Mercado Pago');

    const [cuentas, asignadas] = await Promise.all([
      this.dbRepository.findMany({
        entity: 'org_mp_account',
        where: { organizationUuid: access.organizationUuid, isDeleted: IsNull() } as never,
        other: { order: { createdAt: 'ASC' } }
      }) as Promise<{ uuid: string; alias: string; mpUserId: string; status: string }[]>,

      this.dbRepository.findMany({
        entity: 'event_mp_account',
        where: { eventUuid, isDeleted: IsNull() } as never
      }) as Promise<{ orgMpAccountUuid: string }[]>
    ]);

    const asignadasSet = new Set(asignadas.map(a => a.orgMpAccountUuid));

    // Se devuelven TODAS las cuentas de la organización, no solo las asignadas:
    // la pantalla es un selector, y necesita mostrar también las disponibles.
    return cuentas.map(c => ({
      orgMpAccountUuid: c.uuid,
      alias: c.alias,
      mpUserId: c.mpUserId,
      status: c.status,
      assigned: asignadasSet.has(c.uuid)
    }));
  }

  async setMpAccounts(
    eventUuid: string,
    orgMpAccountUuids: string[],
    loggedUser: string
  ): Promise<IEventMpAccount[]> {
    const access = await this.resolveAccess(eventUuid, loggedUser);
    this.assertProducer(access, 'asignar cuentas de Mercado Pago');

    const unique = [...new Set(orgMpAccountUuids)];

    if (unique.length) {
      const propias = (await this.dbRepository.findMany({
        entity: 'org_mp_account',
        where: {
          uuid: In(unique),
          organizationUuid: access.organizationUuid,
          isDeleted: IsNull()
        } as never,
        select: { uuid: true } as never
      })) as { uuid: string }[];

      if (propias.length !== unique.length) {
        throw new BadRequestException('Alguna de las cuentas no es de tu productora');
      }
    }

    // Se reemplaza el conjunto completo: el selector manda el estado final, no
    // un diff. Cero cuentas es válido (BR-CASH-010).
    await this.dataSource.query('DELETE FROM event_mp_account WHERE eventUuid = ?', [eventUuid]);

    for (const orgMpAccountUuid of unique) {
      await this.dataSource.query(
        'INSERT INTO event_mp_account (uuid, eventUuid, orgMpAccountUuid) VALUES (?, ?, ?)',
        [uuidv4(), eventUuid, orgMpAccountUuid]
      );
    }

    return this.listMpAccounts(eventUuid, loggedUser);
  }


  // ── Movimientos MP (FP11 §5b) ───────────────────────────────────────────────

  /**
   * `additional_info.items` de MP tiene forma libre. Se normaliza acá y no en
   * el sync porque el crudo se guarda tal cual: si mañana cambia la lectura,
   * los movimientos ya sincronizados no hay que volver a traerlos.
   */
  private toMovementItems(raw: unknown): IMpMovementItem[] {
    if (!Array.isArray(raw)) return [];

    return raw
      .map(entry => {
        const item = (entry ?? {}) as Record<string, unknown>;
        const name = String(item.title ?? '').trim();
        if (!name) return null;

        const quantity = Number(item.quantity ?? 1);
        const unitPrice = Number(item.unit_price ?? 0);

        return {
          name,
          quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
          unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0
        };
      })
      .filter((i): i is IMpMovementItem => i !== null);
  }

  private toMovement(
    entity: MpMovementEntity & { mpAccount?: { alias?: string } }
  ): IMpMovement {
    return {
      uuid: entity.uuid,
      eventUuid: entity.eventUuid,
      orgMpAccountUuid: entity.orgMpAccountUuid,
      accountAlias: entity.mpAccount?.alias ?? 'Cuenta eliminada',
      mpPaymentId: entity.mpPaymentId,
      amount: Number(entity.amount),
      refundedAmount: Number(entity.refundedAmount ?? 0),
      type: entity.type,
      occurredAt: entity.occurredAt,
      items: this.toMovementItems(entity.rawItems),
      eventIncomeUuid: entity.eventIncomeUuid,
      createdAt: entity.createdAt
    };
  }

  async listMpMovements(eventUuid: string, loggedUser: string): Promise<IMpMovement[]> {
    const access = await this.resolveAccess(eventUuid, loggedUser);
    this.assertProducer(access, 'ver los movimientos de Mercado Pago');

    const movements = (await this.dbRepository.findMany({
      entity: 'mp_movement',
      where: { eventUuid, isDeleted: IsNull() } as never,
      relations: { mpAccount: true } as never,
      other: { order: { occurredAt: 'DESC' } } as never
    })) as MpMovementEntity[];

    return movements.map(m => this.toMovement(m));
  }

  private async requireMovement(
    eventUuid: string,
    movementUuid: string
  ): Promise<MpMovementEntity> {
    const movement = (await this.dbRepository.findOne({
      entity: 'mp_movement',
      where: { uuid: movementUuid, eventUuid, isDeleted: IsNull() } as never,
      relations: { mpAccount: true } as never
    })) as MpMovementEntity | null;

    if (!movement) throw new NotFoundException('El movimiento no existe en este evento');
    return movement;
  }

  async updateMpMovement(
    eventUuid: string,
    movementUuid: string,
    payload: IUpdateMpMovementPayload,
    loggedUser: string
  ): Promise<IMpMovement> {
    const access = await this.resolveAccess(eventUuid, loggedUser);
    this.assertProducer(access, 'modificar movimientos de Mercado Pago');

    const movement = await this.requireMovement(eventUuid, movementUuid);
    const data: Partial<MpMovementEntity> = {};

    if (payload.type) data.type = payload.type;

    if (payload.targetEventUuid && payload.targetEventUuid !== eventUuid) {
      // Reasignar solo dentro de la misma productora: un movimiento no puede
      // terminar en la caja de otra organización.
      const target = await this.dbRepository.findOne({
        entity: 'event',
        where: { uuid: payload.targetEventUuid, organizationUuid: access.organizationUuid } as never
      });
      if (!target) throw new BadRequestException('El evento destino no es de tu productora');

      if (movement.eventIncomeUuid) {
        throw new BadRequestException(
          'El movimiento ya tiene un ingreso cargado. Borrá ese ingreso antes de reasignarlo.'
        );
      }

      data.eventUuid = payload.targetEventUuid;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No hay nada para modificar');
    }

    await this.dbRepository.update({
      entity: 'mp_movement',
      where: { uuid: movement.uuid },
      data
    });

    return this.toMovement(Object.assign(movement, data));
  }

  /**
   * Completa el detalle de un movimiento generando un ingreso `mp_auto`.
   *
   * El ingreso es el **desglose** de plata que ya entró por MP, no plata nueva:
   * por eso el resumen no lo suma al total (`BR-CASH-007`) y el detalle no
   * puede superar el monto del movimiento.
   */
  async completeMovementProducts(
    eventUuid: string,
    movementUuid: string,
    products: IIncomeProductPayload[],
    loggedUser: string
  ): Promise<IIncome> {
    const access = await this.resolveAccess(eventUuid, loggedUser);
    this.assertProducer(access, 'completar el detalle de un movimiento');

    const movement = await this.requireMovement(eventUuid, movementUuid);

    if (movement.type === 'egreso_mp') {
      throw new BadRequestException('Una devolución no lleva detalle de productos');
    }
    if (movement.eventIncomeUuid) {
      throw new BadRequestException('Este movimiento ya tiene el detalle cargado');
    }

    this.validateProducts(products);

    const resolved: EventIncomeProductEntity[] = [];
    let total = 0;
    const incomeUuid = uuidv4();

    for (const item of products) {
      const name = await this.resolveProductName(eventUuid, access.organizationUuid, item);
      const subtotal = Math.round(item.quantity * item.unitPrice * 100) / 100;
      total += subtotal;

      const product = new EventIncomeProductEntity();
      product.uuid = uuidv4();
      product.eventIncomeUuid = incomeUuid;
      product.type = item.type;
      product.referenceUuid = item.referenceUuid ?? null;
      product.name = name;
      product.quantity = item.quantity;
      product.unitPrice = item.unitPrice;
      product.subtotal = subtotal;
      resolved.push(product);
    }

    total = Math.round(total * 100) / 100;
    const amount = Number(movement.amount);

    // Un centavo de tolerancia: los redondeos de MP y los del carrito no
    // siempre caen en el mismo lado.
    if (total > amount + 0.01) {
      throw new BadRequestException(
        `El detalle suma $${total} y el movimiento fue de $${amount}`
      );
    }

    const income = new EventIncomeEntity();
    income.uuid = incomeUuid;
    income.eventUuid = eventUuid;
    income.source = 'mp_auto';
    income.method = 'mercadopago';
    income.occurredAt = movement.occurredAt;
    income.notes = null;
    income.total = total;
    income.createdBy = loggedUser;
    income.mpMovementUuid = movement.uuid;
    income.isDeleted = null;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.manager.save(EventIncomeEntity, income);
      await queryRunner.manager.save(EventIncomeProductEntity, resolved);
      // El vínculo va en las dos puntas: la lista de movimientos muestra cuáles
      // quedan por completar sin tener que buscar el ingreso.
      await queryRunner.manager.update(
        MpMovementEntity,
        { uuid: movement.uuid },
        { eventIncomeUuid: incomeUuid }
      );
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    const creator = await this.resolveCreatorName(income.createdBy);
    return this.toIncome({ ...income, creator } as EventIncomeEntity & {
      creator?: { firstName?: string; lastName?: string };
    }, resolved);
  }
}
