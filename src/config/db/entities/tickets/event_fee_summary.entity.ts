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

const tableName = 'event_fee_summary' as const;

/**
 * Resumen materializado de comisiones de servicio por evento.
 * Una fila por evento (eventUuid único). Se actualiza de forma incremental
 * y atómica cada vez que una orden se confirma como pagada — nunca se
 * recalcula desde cero.
 */
@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class EventFeeSummaryEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'char', length: 36, unique: true })
  eventUuid: string;

  @Column({ type: 'int', default: 0 })
  totalOrdersPaid: number;

  @Column({ type: 'int', default: 0 })
  totalTicketsSold: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  grossAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  ticketAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  serviceFeeAmount: number;

  @Column({ type: 'varchar', length: 3, default: 'ARS' })
  currency: string;

  @Column({ type: 'timestamp', nullable: true, default: null })
  lastOrderPaidAt: Date | null;

  @CreateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => EventEntity)
  @JoinColumn({ name: 'eventUuid', referencedColumnName: 'uuid' })
  event: EventEntity;
}

export const EventFeeSummaryEntityData = {
  name: tableName,
  entity: EventFeeSummaryEntity
} as const;
