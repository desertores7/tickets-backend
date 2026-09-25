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

const tableName = 'ticket_type' as const;

@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class TicketTypeEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'char', length: 36 })
  eventUuid: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true, default: null })
  description: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ type: 'varchar', length: 3, default: 'ARS' })
  currency: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'int' })
  availableQuantity: number;

  @Column({ type: 'int', default: 1 })
  minPerOrder: number;

  @Column({ type: 'int', default: 10 })
  maxPerOrder: number;

  /**
   * Tope acumulado por comprador (todas sus órdenes, no solo una). `null` =
   * sin tope. Distinto de `maxPerOrder`: ese solo limita una orden puntual —
   * sin esto, alguien puede juntar varias órdenes pagadas (o varias pestañas
   * con reservas pendientes en paralelo) para superarlo igual.
   */
  @Column({ type: 'int', nullable: true, default: null })
  maxPerBuyer: number | null;

  /** Cómo se vende (`BR-SALE-010`). Ver `event/services/core/ticket-type-sale-mode.ts`. */
  @Column({ type: 'enum', enum: ['general', 'per_person', 'whole_unit'], default: 'general' })
  saleMode: 'general' | 'per_person' | 'whole_unit';

  /** Entradas que da una unidad completa. Solo con `saleMode = 'whole_unit'`. */
  @Column({ type: 'int', nullable: true, default: null })
  admissionsPerUnit: number | null;

  @Column({ type: 'timestamp', nullable: true, default: null })
  saleStartDate: Date | null;

  @Column({ type: 'timestamp', nullable: true, default: null })
  saleEndDate: Date | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'boolean', default: true })
  salesEnabled: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  updatedAt: Date;

  //Relations
  @ManyToOne(() => EventEntity, event => event.ticketTypes)
  @JoinColumn({ name: 'eventUuid', referencedColumnName: 'uuid' })
  event: EventEntity;
}

export const TicketTypeEntityData = {
  name: tableName,
  entity: TicketTypeEntity
} as const;