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
import { OrganizationEntity } from '../user/organization.entity';
import { TicketTypeEntity } from './ticket_type.entity';

const tableName = 'event' as const;

@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class EventEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true, default: null })
  description: string | null;

  @Column({ type: 'varchar', length: 255, unique: true })
  slug: string;

  /** Banner principal. Se mantiene sincronizado con la variante `desktop` de bannerImages. */
  @Column({ type: 'varchar', length: 500, nullable: true, default: null })
  bannerUrl: string | null;

  /** URLs por plataforma: { desktop, mobile, thumbnail } */
  @Column({ type: 'json', nullable: true, default: null })
  bannerImages: Record<string, string> | null;

  @Column({ type: 'timestamp' })
  startDate: Date;

  @Column({ type: 'timestamp' })
  endDate: Date;

  @Column({ type: 'timestamp', nullable: true, default: null })
  saleStartDate: Date | null;

  @Column({ type: 'timestamp', nullable: true, default: null })
  saleEndDate: Date | null;

  @Column({ type: 'boolean', default: false })
  isPublished: boolean;

  /** Momento en que el evento salió a la venta. Null mientras es borrador. */
  @Column({ type: 'timestamp', precision: 3, nullable: true, default: null })
  publishedAt: Date | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'char', length: 36 })
  organizationUuid: string;

  @Column({ type: 'varchar', length: 255 })
  venueName: string;

  @Column({ type: 'varchar', length: 500 })
  venueAddress: string;

  @Column({ type: 'varchar', length: 100 })
  venueCity: string;

  @Column({ type: 'varchar', length: 100 })
  venueCountry: string;

  @Column({ type: 'int' })
  maxCapacity: number;

  @CreateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  updatedAt: Date;

  //Relations
  @ManyToOne(() => OrganizationEntity)
  @JoinColumn({ name: 'organizationUuid', referencedColumnName: 'uuid' })
  organization: OrganizationEntity;

  @OneToMany(() => TicketTypeEntity, ticketType => ticketType.event)
  ticketTypes: TicketTypeEntity[];
}

export const EventEntityData = {
  name: tableName,
  entity: EventEntity
} as const;