import { DB_NAME } from '@config/db/meta/db.const';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { EventEntity } from './event.entity';
import { OrderEntity } from './order.entity';
import { RefundRequestTicketEntity } from './refund_request_ticket.entity';

const tableName = 'refund_request' as const;

/**
 * Estados de una solicitud (`BR-REFUND-004`).
 *
 * Separan **nuestra decisión** del **resultado del pago**, que son dos
 * preguntas distintas: una solicitud aprobada puede todavía no estar pagada.
 */
export const REFUND_REQUEST_STATUSES = [
  /** Creada por el comprador, esperando al cron. */
  'pending',
  /** El cron la validó; falta ejecutar el reintegro en MP. */
  'approved',
  /** Enviada a MP, que respondió `in_process`. */
  'processing',
  /** MP confirmó: la plata volvió. Terminal. */
  'refunded',
  /** El cron la rechazó, con motivo. Terminal. */
  'rejected',
  /** MP la rechazó o falló el llamado. Requiere acción manual del Admin. */
  'failed'
] as const;
export type RefundRequestStatus = (typeof REFUND_REQUEST_STATUSES)[number];

/** Estados en los que el ticket sigue comprometido y no se puede volver a pedir. */
export const REFUND_ACTIVE_STATUSES: RefundRequestStatus[] = [
  'pending',
  'approved',
  'processing',
  'refunded'
];

/**
 * Solicitud de reembolso por cambio material (`BR-REFUND-001`).
 *
 * Solo existe si el evento tuvo un cambio material y su ventana sigue abierta
 * (`BR-REFUND-010`): no hay reembolso "porque sí".
 *
 * `amount` **nunca incluye el costo de servicio** (`BR-REFUND-006`): es la suma
 * del valor de las entradas incluidas, y nada más.
 */
@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class RefundRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'varchar', length: 36 })
  orderUuid: string;

  /** Denormalizado: la vista del productor (`29` §7) filtra por evento. */
  @Column({ type: 'varchar', length: 36 })
  eventUuid: string;

  /** Quien pide. Tiene que ser el comprador original. */
  @Column({ type: 'varchar', length: 36 })
  userUuid: string;

  @Column({ type: 'enum', enum: REFUND_REQUEST_STATUSES, default: 'pending' })
  status: RefundRequestStatus;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 3, default: 'ARS' })
  currency: string;

  /** Pago de Mercado Pago sobre el que se ejecuta el reintegro. */
  @Column({ type: 'varchar', length: 64 })
  mpPaymentId: string;

  @Column({ type: 'varchar', length: 64, nullable: true, default: null })
  mpRefundId: string | null;

  /** Lo que MP dice que efectivamente le volvió al comprador. */
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true, default: null })
  amountRefundedToPayer: number | null;

  /** Número del procesador: es con el que se le reclama a MP. */
  @Column({ type: 'varchar', length: 64, nullable: true, default: null })
  uniqueSequenceNumber: string | null;

  /** Motivo del rechazo o del fallo. Va en el email y lo lee el Admin. */
  @Column({ type: 'varchar', length: 500, nullable: true, default: null })
  resolutionReason: string | null;

  @Column({ type: 'timestamp', precision: 3, default: () => 'CURRENT_TIMESTAMP(3)' })
  requestedAt: Date;

  @Column({ type: 'timestamp', precision: 3, nullable: true, default: null })
  resolvedAt: Date | null;

  /**
   * Intentos de ejecutar el reintegro. Solo lo sube una acción manual: el cron
   * **nunca reintenta** (`BR-REFUND-011`), porque reintentar sobre un refund
   * que en realidad salió devuelve el dinero dos veces.
   */
  @Column({ type: 'int', default: 0 })
  attempts: number;

  @CreateDateColumn({ type: 'timestamp', precision: 3 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', precision: 3 })
  updatedAt: Date;

  @ManyToOne(() => OrderEntity)
  @JoinColumn({ name: 'orderUuid', referencedColumnName: 'uuid' })
  order: OrderEntity;

  @ManyToOne(() => EventEntity)
  @JoinColumn({ name: 'eventUuid', referencedColumnName: 'uuid' })
  event: EventEntity;

  @OneToMany(() => RefundRequestTicketEntity, item => item.refundRequest)
  tickets: RefundRequestTicketEntity[];
}

export const RefundRequestEntityData = {
  name: tableName,
  entity: RefundRequestEntity
} as const;
