import { DB_NAME } from '@config/db/meta/db.const';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from 'typeorm';
import { RefundRequestEntity } from './refund_request.entity';
import { TicketEntity } from './ticket.entity';

const tableName = 'refund_request_ticket' as const;

/**
 * Una entrada incluida en una solicitud de reembolso (`BR-REFUND-009`).
 *
 * La unidad del reembolso es el ticket y no la orden: por eso el comprador
 * puede pedir 2 de 5 hoy y las 3 restantes cuando el evento se cancela.
 *
 * `amount` es el valor de esa entrada al momento de la compra, **sin costo de
 * servicio**. Se congela acá en vez de recalcularse desde `order_item`, para
 * que un cambio posterior de precio no altere un reembolso ya resuelto.
 */
@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class RefundRequestTicketEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'varchar', length: 36 })
  refundRequestUuid: string;

  @Column({ type: 'varchar', length: 36 })
  ticketUuid: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: number;

  @CreateDateColumn({ type: 'timestamp', precision: 3 })
  createdAt: Date;

  @ManyToOne(() => RefundRequestEntity, request => request.tickets)
  @JoinColumn({ name: 'refundRequestUuid', referencedColumnName: 'uuid' })
  refundRequest: RefundRequestEntity;

  @ManyToOne(() => TicketEntity)
  @JoinColumn({ name: 'ticketUuid', referencedColumnName: 'uuid' })
  ticket: TicketEntity;
}

export const RefundRequestTicketEntityData = {
  name: tableName,
  entity: RefundRequestTicketEntity
} as const;
