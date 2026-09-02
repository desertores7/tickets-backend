import { DB_NAME } from '@config/db/meta/db.const';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from 'typeorm';
import { CouponEntity } from './coupon.entity';

const tableName = 'coupon_redemption' as const;

/**
 * Uso concreto de un cupón en una orden.
 *
 * Existe como tabla propia y no como un contador en `coupon` porque
 * `BR-COUPON-003` permite limitar a **un uso por usuario**: hace falta saber
 * quién lo usó, no solo cuántas veces.
 *
 * Se registra al confirmarse el pago, no al crear la orden: una orden que nunca
 * se paga no debe consumir un cupón.
 */
@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class CouponRedemptionEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'varchar', length: 36 })
  couponUuid: string;

  @Column({ type: 'varchar', length: 36 })
  orderUuid: string;

  @Column({ type: 'varchar', length: 36 })
  userUuid: string;

  /** Monto efectivamente descontado, para poder auditar después. */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  discountAmount: number;

  @CreateDateColumn({ type: 'timestamp', precision: 3 })
  createdAt: Date;

  @ManyToOne(() => CouponEntity)
  @JoinColumn({ name: 'couponUuid', referencedColumnName: 'uuid' })
  coupon: CouponEntity;
}

export const CouponRedemptionEntityData = {
  name: tableName,
  entity: CouponRedemptionEntity
} as const;
