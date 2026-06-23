import { DB_NAME } from '@config/db/meta/db.const';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { OrderEntity } from './order.entity';

export enum PaymentProvider {
  MERCADOPAGO = 'mercadopago',
  DLOCAL = 'dlocal'
}

export enum PaymentStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled',
  IN_PROCESS = 'in_process'
}

const tableName = 'payment' as const;

@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class PaymentEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'char', length: 36, unique: true })
  orderUuid: string;

  @Column({ type: 'enum', enum: PaymentProvider })
  provider: PaymentProvider;

  @Column({ type: 'varchar', length: 255 })
  providerPaymentId: string;

  @Column({ type: 'varchar', length: 100 })
  providerStatus: string;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  paymentMethod: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, default: null })
  paymentType: string | null;

  @Column({ type: 'int', nullable: true, default: null })
  installments: number | null;

  @Column({ type: 'json' })
  rawResponse: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  updatedAt: Date;

  // Relations
  @OneToOne(() => OrderEntity, order => order.payment)
  @JoinColumn({ name: 'orderUuid', referencedColumnName: 'uuid' })
  order: OrderEntity;
}

export const PaymentEntityData = {
  name: tableName,
  entity: PaymentEntity
} as const;
