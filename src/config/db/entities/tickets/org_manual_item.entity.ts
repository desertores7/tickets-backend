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

const tableName = 'org_manual_item' as const;

export const MANUAL_ITEM_CATEGORIES = ['bebidas', 'comida', 'merch', 'otro'] as const;
export type ManualItemCategory = (typeof MANUAL_ITEM_CATEGORIES)[number];

/**
 * Producto cargado a mano por la productora (`BR-CASH-002`, FP11 §3).
 *
 * Es org-wide: todos los eventos de la productora ven los mismos ítems, sin
 * tener que recargarlos evento por evento.
 *
 * `referencePrice` es solo una sugerencia: al registrar un ingreso el precio se
 * puede pisar, y cambiarlo acá NO altera las ventas ya registradas.
 */
@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class OrgManualItemEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'varchar', length: 36 })
  organizationUuid: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, default: null })
  referencePrice: number | null;

  @Column({ type: 'enum', enum: MANUAL_ITEM_CATEGORIES, nullable: true, default: null })
  category: ManualItemCategory | null;

  /** Un item inactivo no se ofrece al cargar ingresos, pero no se borra. */
  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'boolean', nullable: true, default: null })
  isDeleted: boolean | null;

  @CreateDateColumn({ type: 'timestamp', precision: 3 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', precision: 3 })
  updatedAt: Date;

  @ManyToOne(() => OrganizationEntity)
  @JoinColumn({ name: 'organizationUuid', referencedColumnName: 'uuid' })
  organization: OrganizationEntity;
}

export const OrgManualItemEntityData = {
  name: tableName,
  entity: OrgManualItemEntity
} as const;
