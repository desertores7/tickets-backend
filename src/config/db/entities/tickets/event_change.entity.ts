import { DB_NAME } from '@config/db/meta/db.const';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn
} from 'typeorm';
import { UserEntity } from '../user/user.entity';
import { EventEntity } from './event.entity';
import { TicketTypeEntity } from './ticket_type.entity';

export const EVENT_CHANGE_TYPES = [
  'reschedule',
  'venue',
  'lineup',
  'cancellation',
  'sales_close',
  'stock',
  'info'
] as const;

export type EventChangeType = (typeof EVENT_CHANGE_TYPES)[number];

export type EventChangeFieldSnapshot = {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
};

/** Alias usado en main / docs (`EventChangeField`). */
export type EventChangeField = EventChangeFieldSnapshot;

const tableName = 'event_change' as const;

/**
 * Historial de cambios del evento (FP10 / BR-EVENT-010 / BR-REFUND-010).
 * `changes` guarda texto congelado (antes/después) para el Dashboard del Productor.
 */
@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class EventChangeEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  uuid: string;

  @Column({ type: 'varchar', length: 36 })
  eventUuid: string;

  @Column({
    type: 'enum',
    enum: EVENT_CHANGE_TYPES
  })
  type: EventChangeType;

  @Column({ type: 'boolean', default: false })
  isMaterial: boolean;

  @Column({ type: 'varchar', length: 1000, nullable: true, default: null })
  reason: string | null;

  @Column({ type: 'json' })
  changes: EventChangeFieldSnapshot[];

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  ticketTypeUuid: string | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true, default: null })
  refundWindowEndsAt: Date | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true, default: null })
  notifiedAt: Date | null;

  @Column({ type: 'int', default: 0 })
  buyersNotified: number;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  createdByUuid: string | null;

  @CreateDateColumn({ type: 'timestamp', precision: 3 })
  createdAt: Date;

  @ManyToOne(() => EventEntity)
  @JoinColumn({ name: 'eventUuid', referencedColumnName: 'uuid' })
  event: EventEntity;

  @ManyToOne(() => TicketTypeEntity, { nullable: true })
  @JoinColumn({ name: 'ticketTypeUuid', referencedColumnName: 'uuid' })
  ticketType: TicketTypeEntity | null;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'createdByUuid', referencedColumnName: 'uuid' })
  createdBy: UserEntity | null;
}

export const EventChangeEntityData = {
  name: tableName,
  entity: EventChangeEntity
} as const;
