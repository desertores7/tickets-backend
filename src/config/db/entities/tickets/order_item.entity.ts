import { DB_NAME } from '@config/db/meta/db.const';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn
} from 'typeorm';
import { OrderEntity } from './order.entity';
import { TicketTypeEntity } from './ticket_type.entity';
import { TicketEntity } from './ticket.entity';

const tableName = 'order_item' as const;

@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class OrderItemEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'char', length: 36 })
  orderUuid: string;

  @Column({ type: 'char', length: 36 })
  ticketTypeUuid: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unitPrice: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subtotal: number;

  // Relations
  @ManyToOne(() => OrderEntity, order => order.items)
  @JoinColumn({ name: 'orderUuid', referencedColumnName: 'uuid' })
  order: OrderEntity;

  @ManyToOne(() => TicketTypeEntity)
  @JoinColumn({ name: 'ticketTypeUuid', referencedColumnName: 'uuid' })
  ticketType: TicketTypeEntity;

  @OneToMany(() => TicketEntity, ticket => ticket.orderItem)
  tickets: TicketEntity[];
}

export const OrderItemEntityData = {
  name: tableName,
  entity: OrderItemEntity
} as const;