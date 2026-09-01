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
import { TicketTypeEntity } from './ticket_type.entity';

const tableName = 'stock_alert' as const;

/**
 * Alerta de stock de una tanda (`BR-EVENT-017`).
 *
 * El tono es de felicitación, no de alarma: que se agote una tanda es que el
 * evento vende bien.
 *
 * Los campos `*NotifiedAt` existen para no repetir el aviso. Sin ellos, cada
 * compra posterior al cruce del umbral dispararía otra notificación.
 */
@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class StockAlertEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'varchar', length: 36 })
  eventUuid: string;

  @Column({ type: 'varchar', length: 36 })
  ticketTypeUuid: string;

  /** Umbral "queda poco". Null = solo avisa al agotarse. */
  @Column({ type: 'int', nullable: true, default: null })
  lowThreshold: number | null;

  /** Si es true, `lowThreshold` se interpreta como porcentaje del stock total. */
  @Column({ type: 'boolean', default: false })
  thresholdIsPercent: boolean;

  @Column({ type: 'boolean', default: true })
  notifySoldOut: boolean;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'timestamp', precision: 3, nullable: true, default: null })
  lowNotifiedAt: Date | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true, default: null })
  soldOutNotifiedAt: Date | null;

  @Column({ type: 'boolean', nullable: true, default: null })
  isDeleted: boolean | null;

  @CreateDateColumn({ type: 'timestamp', precision: 3 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', precision: 3 })
  updatedAt: Date;

  @ManyToOne(() => EventEntity)
  @JoinColumn({ name: 'eventUuid', referencedColumnName: 'uuid' })
  event: EventEntity;

  @ManyToOne(() => TicketTypeEntity)
  @JoinColumn({ name: 'ticketTypeUuid', referencedColumnName: 'uuid' })
  ticketType: TicketTypeEntity;
}

export const StockAlertEntityData = {
  name: tableName,
  entity: StockAlertEntity
} as const;
