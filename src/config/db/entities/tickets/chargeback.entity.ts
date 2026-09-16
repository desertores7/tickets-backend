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
import { OrderEntity } from './order.entity';

const tableName = 'chargeback' as const;

/**
 * Contracargo: el comprador disputó el pago con su banco en vez de pedirnos el
 * reembolso (`BR-SUPPORT-004`).
 *
 * Se guarda una fila por contracargo de Mercado Pago. El estado y los plazos
 * los manda MP; lo nuestro es enterarnos a tiempo y dejar constancia, porque un
 * contracargo perdido es plata que MP descuenta de la cuenta, se haya usado la
 * entrada o no (`BR-SUPPORT-005`).
 */
@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class ChargebackEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  /** Id del contracargo en Mercado Pago. Único: el webhook llega repetido. */
  @Column({ type: 'varchar', length: 64, unique: true })
  mpChargebackId: string;

  /** Pago disputado, tal como lo identifica MP. */
  @Column({ type: 'varchar', length: 64, nullable: true, default: null })
  mpPaymentId: string | null;

  /**
   * Orden y evento a los que llegamos desde el pago. Quedan en `null` si el
   * pago no es nuestro o todavía no lo registramos: la fila se guarda igual,
   * porque perder el aviso es peor que tenerlo incompleto.
   */
  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  orderUuid: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  eventUuid: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  amount: number;

  @Column({ type: 'varchar', length: 3, default: 'ARS' })
  currency: string;

  /** Estado que reporta MP (`pending`, `in_process`, `won`, `lost`, …). */
  @Column({ type: 'varchar', length: 40 })
  status: string;

  /** MP pide documentación de respaldo. */
  @Column({ type: 'tinyint', width: 1, default: 0 })
  documentationRequired: boolean;

  @Column({ type: 'varchar', length: 40, nullable: true, default: null })
  documentationStatus: string | null;

  /** Hasta cuándo se puede responder. Pasada esta fecha, se pierde solo. */
  @Column({ type: 'timestamp', nullable: true, default: null })
  documentationDeadline: Date | null;

  /** MP cubre el monto (no lo descuenta de la cuenta). */
  @Column({ type: 'tinyint', width: 1, default: 0 })
  coverageApplied: boolean;

  /** Respuesta cruda de MP: el recurso cambia y acá queda lo que mandó. */
  @Column({ type: 'json', nullable: true, default: null })
  rawResponse: Record<string, unknown> | null;

  /** Notas del equipo. Nunca salen de la plataforma. */
  @Column({ type: 'text', nullable: true, default: null })
  internalNotes: string | null;

  /** Cuándo llegó el primer aviso y cuándo MP lo dio por terminado. */
  @Column({ type: 'timestamp', nullable: true, default: null })
  receivedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true, default: null })
  closedAt: Date | null;

  @CreateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => OrderEntity)
  @JoinColumn({ name: 'orderUuid', referencedColumnName: 'uuid' })
  order: OrderEntity;

  @ManyToOne(() => EventEntity)
  @JoinColumn({ name: 'eventUuid', referencedColumnName: 'uuid' })
  event: EventEntity;
}

export const ChargebackEntityData = {
  name: tableName,
  entity: ChargebackEntity
} as const;
