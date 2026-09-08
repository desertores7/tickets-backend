import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { EnvService } from '@config/env/env.service';
import { DBRepository } from '@config/db/db.repository';
import {
  SupportRequestEntity,
  SupportRequestStatus
} from '@config/db/entities/system/support_request.entity';
import { NotificationEmailService } from '@modules/notifications/services/implementation/notification-email.service';
import { IPaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { ISearchParams } from '@root/shared/decorators/search-query.decorator';
import {
  ISupportContactData,
  ISupportService,
  TSupportFilters,
  TSupportRequest,
  TSupportUpdate
} from '../contracts/isupport.service';

const TYPE_LABELS: Record<ISupportContactData['type'], string> = {
  problema_compra: 'Problema con una compra',
  no_recibi_entrada: 'No recibí mi entrada',
  consulta_evento: 'Consulta sobre un evento',
  otro: 'Otro'
};

@Injectable()
export class SupportService implements ISupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly envService: EnvService,
    private readonly notificationEmailService: NotificationEmailService,
    private readonly dbRepository: DBRepository,
    private readonly dataSource: DataSource
  ) {}

  async contact(data: ISupportContactData): Promise<{ message: string }> {
    // Primero se guarda y después se manda el mail: el email es el canal de
    // trabajo (`BR-SUPPORT-002`), pero la constancia es lo que no se puede
    // perder (`33` §16). Si el insert falla igual se sigue: mejor un mail sin
    // registro que una consulta que se cae del todo.
    await this.persist(data);

    const supportTo =
      this.envService.get('SUPPORT_EMAIL') ||
      this.envService.get('SMTP_FROM_EMAIL') ||
      this.envService.get('SMTP_USER') ||
      this.envService.get('USERNAME_EMAIL');

    const subject = `[Soporte] ${TYPE_LABELS[data.type]} — ${data.email}`;
    const text = [
      `Tipo: ${TYPE_LABELS[data.type]} (${data.type})`,
      `Email: ${data.email}`,
      data.userUuid ? `User UUID: ${data.userUuid}` : null,
      '',
      'Mensaje:',
      data.message
    ]
      .filter(Boolean)
      .join('\n');

    if (!supportTo) {
      this.logger.warn(
        `Support contact received but no SUPPORT_EMAIL/SMTP configured. From=${data.email} type=${data.type}`
      );
      this.logger.log(text);
      return { message: 'Consulta recibida' };
    }

    try {
      await this.notificationEmailService.sendPlainEmail({
        to: supportTo,
        subject,
        text,
        replyTo: data.email
      });
    } catch (error) {
      // Anti-bloqueo local: si SMTP falla, logueamos y respondemos OK.
      this.logger.error(
        `Failed to send support email (responding 200 anyway): ${(error as Error).message}`
      );
      this.logger.log(text);
    }

    return { message: 'Consulta recibida' };
  }

  private async persist(data: ISupportContactData): Promise<void> {
    try {
      const entity = new SupportRequestEntity();
      entity.uuid = uuidv4();
      entity.type = data.type;
      entity.message = data.message;
      entity.email = data.email;
      entity.userUuid = data.userUuid ?? null;
      entity.status = 'new';
      entity.internalNotes = null;
      entity.resolvedBy = null;
      entity.resolvedAt = null;

      await this.dbRepository.create({ entity: 'support_request', data: entity });
    } catch (error) {
      this.logger.error(
        `No se pudo guardar la consulta de soporte (se envía el email igual): ${
          (error as Error).message
        }`
      );
    }
  }

  // ── Bandeja del Administrador (`33` §16) ────────────────────────────────────

  async listRequests(
    search: ISearchParams,
    filters: TSupportFilters,
    pagination: IPaginationParams
  ): Promise<{ items: TSupportRequest[]; total: number; nuevas: number }> {
    const qb = this.baseQuery()
      // Lo sin atender primero, y dentro de eso lo más nuevo arriba: es el
      // orden en el que se trabaja la bandeja.
      .orderBy("FIELD(s.status, 'new', 'in_progress', 'resolved')", 'ASC')
      .addOrderBy('s.createdAt', 'DESC');

    if (filters.status) qb.andWhere('s.status = :status', { status: filters.status });
    if (filters.type) qb.andWhere('s.type = :type', { type: filters.type });

    const term = (search?.search ?? '').trim();
    if (term) {
      qb.andWhere('(LOWER(s.email) LIKE :term OR LOWER(s.message) LIKE :term)', {
        term: `%${term.toLowerCase()}%`
      });
    }

    const total = await qb.clone().getCount();

    // Se cuenta sobre el total, no sobre la página: es el número que dice si
    // hay trabajo pendiente.
    const nuevas = await this.dataSource
      .createQueryBuilder()
      .from('support_request', 's')
      .where("s.status = 'new'")
      .getCount();

    const rows = await qb
      .offset((pagination.page - 1) * pagination.limit)
      .limit(pagination.limit)
      .getRawMany();

    return { items: rows.map(r => this.toRequest(r)), total, nuevas };
  }

  /** El select que comparten el listado y la lectura de una sola consulta. */
  private baseQuery() {
    return this.dataSource
      .createQueryBuilder()
      .select('s.uuid', 'uuid')
      .addSelect('s.type', 'type')
      .addSelect('s.message', 'message')
      .addSelect('s.email', 'email')
      .addSelect('s.status', 'status')
      .addSelect('s.internalNotes', 'internalNotes')
      .addSelect('s.userUuid', 'userUuid')
      .addSelect("CONCAT(u.firstName, ' ', u.lastName)", 'userName')
      .addSelect('u.email', 'userEmail')
      .addSelect('s.resolvedBy', 'resolvedBy')
      .addSelect('s.resolvedAt', 'resolvedAt')
      .addSelect('s.createdAt', 'createdAt')
      .from('support_request', 's')
      .leftJoin('user', 'u', 'u.uuid = s.userUuid');
  }

  private toRequest(r: Record<string, any>): TSupportRequest {
    return {
      uuid: r.uuid,
      type: r.type,
      message: r.message,
      email: r.email,
      status: r.status,
      internalNotes: r.internalNotes,
      userUuid: r.userUuid,
      userName: r.userName ? String(r.userName).trim() : null,
      userEmail: r.userEmail ?? null,
      resolvedBy: r.resolvedBy,
      resolvedAt: r.resolvedAt,
      createdAt: r.createdAt
    };
  }

  async updateRequest(
    requestUuid: string,
    data: TSupportUpdate,
    loggedUser: string
  ): Promise<TSupportRequest> {
    const current = (await this.dbRepository.findOne({
      entity: 'support_request',
      where: { uuid: requestUuid }
    })) as SupportRequestEntity | null;

    if (!current) throw new NotFoundException('La consulta no existe');

    const patch: Partial<SupportRequestEntity> = {};
    if (data.internalNotes !== undefined) patch.internalNotes = data.internalNotes || null;

    if (data.status && data.status !== current.status) {
      patch.status = data.status;
      // Quién la cerró y cuándo, para poder preguntarle después. Reabrirla
      // limpia el dato: si vuelve a estar abierta, nadie la cerró.
      const cerrada: SupportRequestStatus = 'resolved';
      patch.resolvedBy = data.status === cerrada ? loggedUser : null;
      patch.resolvedAt = data.status === cerrada ? new Date() : null;
    }

    if (Object.keys(patch).length > 0) {
      await this.dbRepository.update({
        entity: 'support_request',
        where: { uuid: requestUuid },
        data: patch
      });
    }

    const row = await this.baseQuery()
      .where('s.uuid = :uuid', { uuid: requestUuid })
      .getRawOne();

    return this.toRequest(row);
  }
}
