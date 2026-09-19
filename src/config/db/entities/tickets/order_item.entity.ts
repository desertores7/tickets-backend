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

  /** Unidad del mapa comprada (mesa 8). Null en tandas generales. */
  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  sectorUuid: string | null;

  /** "Mesa VIP · 8", congelado al comprar: el mapa puede cambiar después. */
  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  unitLabel: string | null;

  @Column({ type: 'int' })
  quantity: number;

  /** Entradas por unidad de la línea: >1 solo en unidad completa (`BR-SALE-010`). */
  @Column({ type: 'int', default: 1 })
  admissionsPerUnit: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unitPrice: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subtotal: number;

  /** Parte del descuento del cupón que le tocó a esta línea. */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  discountAmount: number;

  /** Costo de servicio de todas las entradas de la línea, fijado al comprar. */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  serviceFee: number;

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