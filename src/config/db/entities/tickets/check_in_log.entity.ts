import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { DB_NAME } from '@config/db/meta/db.const';
import { TicketEntity } from './ticket.entity';
import { EventEntity } from './event.entity';
import { UserEntity } from '../user/user.entity';

export enum CheckInResult {
  SUCCESS = 'success',
  ALREADY_USED = 'already_used',
  INVALID = 'invalid',
  WRONG_EVENT = 'wrong_event',
  /** Escaneo fuera de la ventana habilitada (antes del día del evento o después de que terminó) */
  OUTSIDE_WINDOW = 'outside_window',
  /** El validador no está habilitado para este evento (no pertenece a su organización) */
  NOT_ASSIGNED = 'not_assigned'
}

const tableName = 'check_in_log' as const;

@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class CheckInLogEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'char', length: 36, nullable: true, default: null })
  ticketUuid: string | null;

  @Column({ type: 'char', length: 36 })
  eventUuid: string;

  @Column({ type: 'char', length: 36 })
  scannedBy: string;

  @Column({ type: 'timestamp', precision: 3, default: () => 'CURRENT_TIMESTAMP(3)' })
  scannedAt: Date;

  @Column({ type: 'enum', enum: CheckInResult })
  result: CheckInResult;

  @Column({ type: 'json', nullable: true, default: null })
  deviceInfo: Record<string, unknown> | null;

  // Relations
  @ManyToOne(() => TicketEntity, { nullable: true })
  @JoinColumn({ name: 'ticketUuid', referencedColumnName: 'uuid' })
  ticket: TicketEntity | null;

  @ManyToOne(() => EventEntity)
  @JoinColumn({ name: 'eventUuid', referencedColumnName: 'uuid' })
  event: EventEntity;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'scannedBy', referencedColumnName: 'uuid' })
  scanner: UserEntity;
}

export const CheckInLogEntityData = {
  name: tableName,
  entity: CheckInLogEntity
} as const;
