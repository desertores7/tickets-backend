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
import { UserEntity } from '../user/user.entity';
import { EventEntity } from './event.entity';
import { TicketTypeEntity } from './ticket_type.entity';
import { OrderItemEntity } from './order_item.entity';

export enum TicketStatus {
  ACTIVE = 'active',
  USED = 'used',
  CANCELLED = 'cancelled',
  TRANSFERRED = 'transferred'
}

const tableName = 'ticket' as const;

@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class TicketEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'char', length: 36 })
  orderItemUuid: string;

  @Column({ type: 'char', length: 36 })
  userUuid: string;

  @Column({ type: 'char', length: 36 })
  eventUuid: string;

  @Column({ type: 'char', length: 36 })
  ticketTypeUuid: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  ticketNumber: string;

  @Column({ type: 'varchar', length: 500, nullable: true, default: null, unique: true })
  qrCode: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, default: null })
  qrUrl: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, default: null })
  pdfUrl: string | null;

  @Column({ type: 'enum', enum: TicketStatus, default: TicketStatus.ACTIVE })
  status: TicketStatus;

  @Column({ type: 'timestamp', nullable: true, default: null })
  checkedInAt: Date | null;

  @Column({ type: 'char', length: 36, nullable: true, default: null })
  checkedInBy: string | null;

  @CreateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => OrderItemEntity, orderItem => orderItem.tickets)
  @JoinColumn({ name: 'orderItemUuid', referencedColumnName: 'uuid' })
  orderItem: OrderItemEntity;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'userUuid', referencedColumnName: 'uuid' })
  user: UserEntity;

  @ManyToOne(() => EventEntity)
  @JoinColumn({ name: 'eventUuid', referencedColumnName: 'uuid' })
  event: EventEntity;

  @ManyToOne(() => TicketTypeEntity)
  @JoinColumn({ name: 'ticketTypeUuid', referencedColumnName: 'uuid' })
  ticketType: TicketTypeEntity;
}

export const TicketEntityData = {
  name: tableName,
  entity: TicketEntity
} as const;