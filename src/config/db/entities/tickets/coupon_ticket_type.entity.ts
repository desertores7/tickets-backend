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
import { TicketTypeEntity } from './ticket_type.entity';

const tableName = 'coupon_ticket_type' as const;

/**
 * Tandas alcanzadas por un cupón (`BR-COUPON-009`).
 *
 * **Sin filas, el cupón aplica a toda la compra.** Con una o más, el descuento
 * se calcula solo sobre el subtotal de esas líneas.
 *
 * Se modela como tabla y no como columna porque un cupón puede alcanzar varias
 * tandas, y porque así el borrado de una tanda arrastra su restricción.
 */
@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class CouponTicketTypeEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'varchar', length: 36 })
  couponUuid: string;

  @Column({ type: 'varchar', length: 36 })
  ticketTypeUuid: string;

  @CreateDateColumn({ type: 'timestamp', precision: 3 })
  createdAt: Date;

  @ManyToOne(() => CouponEntity)
  @JoinColumn({ name: 'couponUuid', referencedColumnName: 'uuid' })
  coupon: CouponEntity;

  @ManyToOne(() => TicketTypeEntity)
  @JoinColumn({ name: 'ticketTypeUuid', referencedColumnName: 'uuid' })
  ticketType: TicketTypeEntity;
}

export const CouponTicketTypeEntityData = {
  name: tableName,
  entity: CouponTicketTypeEntity
} as const;
