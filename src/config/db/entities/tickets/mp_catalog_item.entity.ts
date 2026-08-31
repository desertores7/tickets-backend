import { DB_NAME } from '@config/db/meta/db.const';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { OrganizationEntity } from '../user/organization.entity';
import { OrgMpAccountEntity } from './org_mp_account.entity';

const tableName = 'mp_catalog_item' as const;

/**
 * Producto copiado desde el catálogo de una cuenta de Mercado Pago
 * (`BR-CASH-002`, FP11 §3). Solo lectura para la productora: se actualiza con
 * el botón "Actualizar catálogo", nunca de forma automática.
 *
 * `externalId` es la clave con la que después se matchean los movimientos MP
 * contra el producto vendido, por eso es única dentro de cada cuenta.
 */
@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class MpCatalogItemEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'varchar', length: 36 })
  organizationUuid: string;

  @Column({ type: 'varchar', length: 36 })
  orgMpAccountUuid: string;

  /** Identificador del producto en Mercado Pago */
  @Column({ type: 'varchar', length: 128 })
  externalId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, default: null })
  price: number | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true, default: null })
  lastSyncAt: Date | null;

  @Column({ type: 'boolean', nullable: true, default: null })
  isDeleted: boolean | null;

  @CreateDateColumn({ type: 'timestamp', precision: 3 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', precision: 3 })
  updatedAt: Date;

  @ManyToOne(() => OrganizationEntity)
  @JoinColumn({ name: 'organizationUuid', referencedColumnName: 'uuid' })
  organization: OrganizationEntity;

  @ManyToOne(() => OrgMpAccountEntity)
  @JoinColumn({ name: 'orgMpAccountUuid', referencedColumnName: 'uuid' })
  mpAccount: OrgMpAccountEntity;
}

export const MpCatalogItemEntityData = {
  name: tableName,
  entity: MpCatalogItemEntity
} as const;
