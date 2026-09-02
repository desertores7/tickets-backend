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
import { EventMediaEntity } from './event_media.entity';
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

  /**
   * Lineup estructurado (`BR-EVENT-016`): lista de artistas o actos, distinta
   * de la descripción libre. Cambiarla es un cambio material; reescribir la
   * descripción no.
   */
  @Column({ type: 'json', nullable: true, default: null })
  lineup: string[] | null;

  /** Cancelación del evento (`BR-EVENT-010`). No borra: deja el registro. */
  @Column({ type: 'timestamp', precision: 3, nullable: true, default: null })
  cancelledAt: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true, default: null })
  cancellationReason: string | null;

  /**
   * Corte manual de venta (`BR-EVENT-013`). Va aparte de `saleEndDate` para
   * no pisar la ventana que configuró el productor: cortar a mano es una
   * decisión operativa y se puede deshacer sin perder la fecha original.
   */
  @Column({ type: 'timestamp', precision: 3, nullable: true, default: null })
  salesClosedAt: Date | null;

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

  @Column({ type: 'varchar', length: 20, default: '' })
  venuePostalCode: string;

  /** Link de Google Maps para “Cómo llegar” en la ficha pública. */
  @Column({ type: 'varchar', length: 1000, nullable: true, default: null })
  googleMapsUrl: string | null;

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

  @OneToMany(() => EventMediaEntity, media => media.event)
  media: EventMediaEntity[];
}

export const EventEntityData = {
  name: tableName,
  entity: EventEntity
} as const;