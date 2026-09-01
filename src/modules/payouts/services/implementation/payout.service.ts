import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DBRepository } from '@config/db/db.repository';
import { PayoutEntity } from '@config/db/entities/tickets/payout.entity';
import { FileEntity } from '@config/db/entities/user/file.entity';
import { OrganizationEntity } from '@config/db/entities/user/organization.entity';
import { PAYOUT_FILE_TYPE_UUID_BY_KIND } from '@config/db/const/file-type.const';
import { StorageService } from '@root/shared/services/storage.service';
import {
  ICreatePayoutPayload,
  IPayout,
  IPayoutEventBlock,
  IPayoutFileDownload,
  IPayoutService,
  PayoutFileKind
} from '../contracts/ipayout.service';

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;

@Injectable()
export class PayoutService implements IPayoutService {
  constructor(
    private readonly dbRepository: DBRepository,
    private readonly storageService: StorageService
  ) {}

  // ── Alcance ─────────────────────────────────────────────────────────────────

  private async resolveOrganization(userUuid: string): Promise<OrganizationEntity> {
    const membership = await this.dbRepository.findOne({
      entity: 'user_organization',
      where: { userUuid, isDeleted: IsNull() },
      relations: { organization: true },
      other: { order: { createdAt: 'ASC' } }
    });

    if (!membership?.organization || membership.organization.isDeleted) {
      throw new NotFoundException('No tenés una productora asociada');
    }
    return membership.organization as OrganizationEntity;
  }

  private toPayout(entity: PayoutEntity & { event?: { name?: string } }): IPayout {
    return {
      uuid: entity.uuid,
      eventUuid: entity.eventUuid,
      eventName: entity.event?.name ?? 'Evento',
      // MySQL devuelve decimal como string
      amount: Number(entity.amount),
      transferredAt: entity.transferredAt,
      notes: entity.notes,
      status: entity.status,
      hasTransferProof: Boolean(entity.transferProofFileUuid),
      hasArcaInvoice: Boolean(entity.arcaInvoiceFileUuid),
      createdAt: entity.createdAt
    };
  }

  /**
   * Agrupa por evento (`29` §8). Una liquidación pertenece a exactamente un
   * evento y un evento puede tener varias, asi que la vista son bloques.
   */
  private groupByEvent(
    rows: (PayoutEntity & { event?: { name?: string; startDate?: Date } })[]
  ): IPayoutEventBlock[] {
    const blocks = new Map<string, IPayoutEventBlock>();

    for (const row of rows) {
      let block = blocks.get(row.eventUuid);
      if (!block) {
        block = {
          eventUuid: row.eventUuid,
          eventName: row.event?.name ?? 'Evento',
          eventStartDate: row.event?.startDate ?? null,
          totalAmount: 0,
          payouts: []
        };
        blocks.set(row.eventUuid, block);
      }
      const payout = this.toPayout(row);
      block.payouts.push(payout);
      block.totalAmount = Math.round((block.totalAmount + payout.amount) * 100) / 100;
    }

    // Evento mas reciente primero: es lo que el productor esta esperando cobrar.
    return [...blocks.values()].sort((a, b) => {
      const da = a.eventStartDate ? new Date(a.eventStartDate).getTime() : 0;
      const db = b.eventStartDate ? new Date(b.eventStartDate).getTime() : 0;
      return db - da;
    });
  }

  private async listByOrganization(organizationUuid: string): Promise<IPayoutEventBlock[]> {
    const rows = (await this.dbRepository.findMany({
      entity: 'payout',
      where: { organizationUuid, isDeleted: IsNull() },
      relations: { event: true },
      other: { order: { transferredAt: 'DESC' } }
    })) as (PayoutEntity & { event?: { name?: string; startDate?: Date } })[];

    return this.groupByEvent(rows);
  }

  // ── Productor (solo lectura, BR-REPORT-003) ─────────────────────────────────

  async listMyPayouts(loggedUser: string): Promise<IPayoutEventBlock[]> {
    const org = await this.resolveOrganization(loggedUser);
    return this.listByOrganization(org.uuid);
  }

  async getMyPayout(loggedUser: string, payoutUuid: string): Promise<IPayout> {
    return this.toPayout(await this.requireOwnPayout(loggedUser, payoutUuid));
  }

  async getMyPayoutFile(
    loggedUser: string,
    payoutUuid: string,
    kind: PayoutFileKind
  ): Promise<IPayoutFileDownload> {
    const payout = await this.requireOwnPayout(loggedUser, payoutUuid);
    const fileUuid =
      kind === 'transfer-proof' ? payout.transferProofFileUuid : payout.arcaInvoiceFileUuid;

    if (!fileUuid) {
      throw new NotFoundException(
        kind === 'transfer-proof'
          ? 'Esta liquidación todavía no tiene comprobante de transferencia'
          : 'La factura todavía está pendiente'
      );
    }

    const file = (await this.dbRepository.findOne({
      entity: 'file',
      where: { uuid: fileUuid, isDeleted: IsNull() }
    })) as FileEntity | null;

    if (!file?.relativePath || !file.storedName) {
      throw new NotFoundException('El archivo no está disponible');
    }

    return {
      absolutePath: this.storageService.resolveAbsolutePath(file.relativePath, file.storedName),
      mimeType: file.type || 'application/octet-stream',
      originalName: file.originalName || file.storedName
    };
  }

  private async requireOwnPayout(
    loggedUser: string,
    payoutUuid: string
  ): Promise<PayoutEntity & { event?: { name?: string } }> {
    const org = await this.resolveOrganization(loggedUser);

    const payout = (await this.dbRepository.findOne({
      entity: 'payout',
      where: { uuid: payoutUuid, organizationUuid: org.uuid, isDeleted: IsNull() },
      relations: { event: true }
    })) as (PayoutEntity & { event?: { name?: string } }) | null;

    if (!payout) throw new NotFoundException('La liquidación no existe o no es de tu productora');
    return payout;
  }

  // ── Administrador ───────────────────────────────────────────────────────────

  async listOrganizationPayouts(organizationUuid: string): Promise<IPayoutEventBlock[]> {
    return this.listByOrganization(organizationUuid);
  }

  async createPayout(
    organizationUuid: string,
    payload: ICreatePayoutPayload,
    createdBy: string
  ): Promise<IPayout> {
    const event = await this.dbRepository.findOne({
      entity: 'event',
      where: { uuid: payload.eventUuid }
    });
    if (!event) throw new NotFoundException('El evento no existe');

    // Una liquidación pertenece a la productora dueña del evento: si no
    // coincidieran, el productor vería un pago que no le corresponde.
    if (event.organizationUuid !== organizationUuid) {
      throw new BadRequestException('El evento no pertenece a esa productora');
    }

    const payout = new PayoutEntity();
    payout.uuid = uuidv4();
    payout.organizationUuid = organizationUuid;
    payout.eventUuid = payload.eventUuid;
    payout.amount = payload.amount;
    payout.transferredAt = new Date(payload.transferredAt);
    payout.notes = payload.notes ?? null;
    payout.status = 'invoice_pending';
    payout.createdBy = createdBy;
    payout.isDeleted = null;

    await this.dbRepository.create({ entity: 'payout', data: payout });
    return this.toPayout(
      Object.assign(payout, { event: { name: event.name } }) as PayoutEntity & { event?: { name?: string } }
    );
  }

  async uploadPayoutFile(
    payoutUuid: string,
    kind: PayoutFileKind,
    file: Express.Multer.File
  ): Promise<IPayout> {
    const payout = (await this.dbRepository.findOne({
      entity: 'payout',
      where: { uuid: payoutUuid, isDeleted: IsNull() },
      relations: { event: true }
    })) as (PayoutEntity & { event?: { name?: string } }) | null;

    if (!payout) throw new NotFoundException('La liquidación no existe');

    const ext = ALLOWED_MIME_TYPES[file.mimetype];
    if (!ext) {
      throw new BadRequestException('El archivo debe ser PDF, JPG, PNG o WebP');
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new BadRequestException('El archivo no puede superar los 5 MB');
    }

    const storedName = `${uuidv4()}.${ext}`;
    // Privado: solo el productor dueño y el Administrador pueden descargarlo,
    // siempre por endpoint autenticado, nunca por URL pública.
    const relativePath = `private/organizations/${payout.organizationUuid}/payouts`;

    await this.storageService.savePrivateFile({
      buffer: file.buffer,
      relativePath,
      filename: storedName
    });

    const entity = new FileEntity();
    entity.uuid = uuidv4();
    entity.userUuid = null;
    entity.organizationUuid = payout.organizationUuid;
    entity.path = null;
    entity.type = file.mimetype;
    entity.fileTypeUuid = PAYOUT_FILE_TYPE_UUID_BY_KIND[kind];
    entity.originalName = file.originalname;
    entity.storedName = storedName;
    entity.sizeBytes = file.size;
    entity.relativePath = relativePath;
    entity.isDeleted = null;

    await this.dbRepository.create({ entity: 'file', data: entity });

    const patch: Partial<PayoutEntity> =
      kind === 'transfer-proof'
        ? { transferProofFileUuid: entity.uuid }
        : { arcaInvoiceFileUuid: entity.uuid };

    // El estado se deriva de los archivos: la factura puede llegar después de
    // la transferencia (`BR-FACT-002`), asi que es lo que define si está
    // completa o sigue pendiente.
    const arcaUuid = kind === 'arca-invoice' ? entity.uuid : payout.arcaInvoiceFileUuid;
    patch.status = arcaUuid ? 'invoice_available' : 'invoice_pending';

    await this.dbRepository.update({
      entity: 'payout',
      where: { uuid: payout.uuid },
      data: patch as never
    });

    return this.toPayout({ ...payout, ...patch } as PayoutEntity & { event?: { name?: string } });
  }

  async deletePayout(payoutUuid: string): Promise<void> {
    const payout = await this.dbRepository.findOne({
      entity: 'payout',
      where: { uuid: payoutUuid, isDeleted: IsNull() }
    });
    if (!payout) throw new NotFoundException('La liquidación no existe');

    // Baja lógica: es un registro contable y no debe desaparecer del historial.
    await this.dbRepository.update({
      entity: 'payout',
      where: { uuid: payoutUuid },
      data: { isDeleted: true } as never
    });
  }
}
