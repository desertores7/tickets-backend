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
import { OrgMpAccountEntity } from './org_mp_account.entity';

const tableName = 'event_mp_account' as const;

/**
 * Cuentas de Mercado Pago asignadas a un evento (`BR-CASH-010`).
 *
 * 0–N por evento: **0 es válido** y significa que ese evento solo registra
 * ingresos manuales. Con ≥1, los movimientos de esas cuentas durante la ventana
 * del evento quedan ligados a él.
 */
@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class EventMpAccountEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'varchar', length: 36 })
  eventUuid: string;

  @Column({ type: 'varchar', length: 36 })
  orgMpAccountUuid: string;

  @Column({ type: 'boolean', nullable: true, default: null })
  isDeleted: boolean | null;

  @CreateDateColumn({ type: 'timestamp', precision: 3 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', precision: 3 })
  updatedAt: Date;

  @ManyToOne(() => EventEntity)
  @JoinColumn({ name: 'eventUuid', referencedColumnName: 'uuid' })
  event: EventEntity;

  @ManyToOne(() => OrgMpAccountEntity)
  @JoinColumn({ name: 'orgMpAccountUuid', referencedColumnName: 'uuid' })
  mpAccount: OrgMpAccountEntity;
}

export const EventMpAccountEntityData = {
  name: tableName,
  entity: EventMpAccountEntity
} as const;
