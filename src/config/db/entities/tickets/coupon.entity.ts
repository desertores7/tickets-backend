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
import { EventEntity } from './event.entity';

const tableName = 'coupon' as const;

export const COUPON_TYPES = ['percent', 'fixed'] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

/**
 * Cupón de descuento de un evento (`BR-COUPON-001` a `008`).
 *
 * Siempre pertenece a **un solo evento** (`BR-COUPON-005`): repetir la promoción
 * en otro evento implica crear un cupón nuevo.
 *
 * El descuento se aplica sobre el subtotal y el costo de servicio se calcula
 * después, sobre el subtotal ya descontado (`BR-COUPON-008`).
 */
@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class CouponEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'varchar', length: 36 })
  eventUuid: string;

  /** Visible para el comprador, ej. "Descuento early bird" (`BR-COUPON-007`). */
  @Column({ type: 'varchar', length: 120 })
  name: string;

  /**
   * Lo que tipea el comprador. Se guarda en mayúsculas para poder compararlo
   * sin importar cómo lo escriba.
   */
  @Column({ type: 'varchar', length: 40 })
  code: string;

  @Column({ type: 'enum', enum: COUPON_TYPES })
  type: CouponType;

  /** Porcentaje 1–100 si `type` es percent; monto en ARS si es fixed. */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  value: number;

  /** Null = ilimitado (`BR-COUPON-002`). */
  @Column({ type: 'int', nullable: true, default: null })
  maxUses: number | null;

  @Column({ type: 'int', default: 0 })
  usedCount: number;

  @Column({ type: 'boolean', default: false })
  oncePerUser: boolean;

  @Column({ type: 'timestamp', precision: 3, nullable: true, default: null })
  validFrom: Date | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true, default: null })
  validUntil: Date | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'boolean', nullable: true, default: null })
  isDeleted: boolean | null;

  @CreateDateColumn({ type: 'timestamp', precision: 3 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', precision: 3 })
  updatedAt: Date;

  @ManyToOne(() => EventEntity)
  @JoinColumn({ name: 'eventUuid', referencedColumnName: 'uuid' })
  event: EventEntity;
}

export const CouponEntityData = {
  name: tableName,
  entity: CouponEntity
} as const;
