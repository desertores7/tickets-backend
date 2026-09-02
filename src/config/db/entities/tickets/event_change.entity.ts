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

const tableName = 'event_change' as const;

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

/** Un campo que cambió, con su valor anterior y el nuevo, ya en texto. */
export type EventChangeField = {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
};

/**
 * Registro de un cambio sobre un evento publicado (FP10 / `29` §19).
 *
 * Guarda el **antes y el después ya resuelto a texto** en vez de solo los
 * campos: el email al comprador y el historial tienen que seguir diciendo lo
 * mismo aunque el evento se vuelva a editar diez veces después.
 *
 * `isMaterial` sale de `BR-REFUND-010`: día, horario, venue, lineup y
 * cancelación lo son; editar la descripción no. Solo los materiales **con
 * ventas** abren `refundWindowEndsAt` y notifican.
 */
@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class EventChangeEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'varchar', length: 36 })
  eventUuid: string;

  @Column({ type: 'enum', enum: EVENT_CHANGE_TYPES })
  type: EventChangeType;

  @Column({ type: 'boolean', default: false })
  isMaterial: boolean;

  @Column({ type: 'json', nullable: true, default: null })
  changes: EventChangeField[] | null;

  /** Motivo que escribió el productor. Recomendado al cancelar. */
  @Column({ type: 'varchar', length: 500, nullable: true, default: null })
  reason: string | null;

  /** Solo para `stock`: qué tanda se tocó (`BR-EVENT-005`). */
  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  ticketTypeUuid: string | null;

  /**
   * Fin de la ventana de reembolso (`BR-REFUND-010`): 72 h desde el aviso, o el
   * nuevo inicio del evento si cae antes. Null cuando el cambio no abre ventana.
   */
  @Column({ type: 'timestamp', precision: 3, nullable: true, default: null })
  refundWindowEndsAt: Date | null;

  /** Momento del aviso a compradores. Es el que arranca las 72 h. */
  @Column({ type: 'timestamp', precision: 3, nullable: true, default: null })
  notifiedAt: Date | null;

  @Column({ type: 'int', default: 0 })
  buyersNotified: number;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  createdBy: string | null;

  @CreateDateColumn({ type: 'timestamp', precision: 3 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', precision: 3 })
  updatedAt: Date;

  @ManyToOne(() => EventEntity)
  @JoinColumn({ name: 'eventUuid', referencedColumnName: 'uuid' })
  event: EventEntity;
}

export const EventChangeEntityData = {
  name: tableName,
  entity: EventChangeEntity
} as const;
