import { DB_NAME } from '@config/db/meta/db.const';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { UserEntity } from '../user/user.entity';
import { EventEntity } from './event.entity';
import { OrderItemEntity } from './order_item.entity';
import { PaymentEntity } from './payment.entity';

export enum OrderStatus {
  PENDING_PAYMENT = 'pending_payment',
  PAID = 'paid',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  REFUNDED = 'refunded'
}

const tableName = 'orders' as const;

@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class OrderEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  orderNumber: string;

  @Column({ type: 'char', length: 36 })
  userUuid: string;

  @Column({ type: 'char', length: 36 })
  eventUuid: string;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING_PAYMENT })
  status: OrderStatus;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  serviceFee: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  total: number;

  @Column({ type: 'varchar', length: 3, default: 'ARS' })
  currency: string;

  @Column({ type: 'varchar', length: 50, nullable: true, default: null })
  paymentProvider: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  paymentId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  paymentMethod: string | null;

  @Column({ type: 'timestamp', nullable: true, default: null })
  paidAt: Date | null;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'json', nullable: true, default: null })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'userUuid', referencedColumnName: 'uuid' })
  user: UserEntity;

  @ManyToOne(() => EventEntity)
  @JoinColumn({ name: 'eventUuid', referencedColumnName: 'uuid' })
  event: EventEntity;

  @OneToMany(() => OrderItemEntity, orderItem => orderItem.order)
  items: OrderItemEntity[];

  @OneToOne(() => PaymentEntity, payment => payment.order)
  payment: PaymentEntity;
}

export const OrderEntityData = {
  name: tableName,
  entity: OrderEntity
} as const;