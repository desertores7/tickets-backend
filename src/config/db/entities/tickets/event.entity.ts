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

  @Column({ type: 'boolean', default: false })
  isPublished: boolean;

  /** Momento en que el evento salió a la venta. Null mientras es borrador. */
  @Column({ type: 'timestamp', precision: 3, nullable: true, default: null })
  publishedAt: Date | null;

  /** Cancelación del evento (`BR-EVENT-010`). No despublica ni borra. */
  @Column({ type: 'timestamp', precision: 3, nullable: true, default: null })
  cancelledAt: Date | null;

  @Column({ type: 'varchar', length: 1000, nullable: true, default: null })
  cancellationReason: string | null;

  /**
   * Cierre de venta (`BR-EVENT-013`). Automático al fin del evento, inmediato
   * al cancelar, o manual (productor/admin). Va aparte de `saleEndDate` para
   * no pisar la ventana configurada.
   */
  @Column({ type: 'timestamp', precision: 3, nullable: true, default: null })
  salesClosedAt: Date | null;

  /**
   * Extensión excepcional de la ventana de reembolso (`BR-REFUND-010`), que
   * solo puede poner un Administrador.
   *
   * La ventana por defecto es el **inicio del evento**; este campo la corre
   * más allá cuando la reprogramación o la cancelación llegan tan sobre la
   * hora que el inicio no deja plazo útil. Null = rige el default.
   *
   * No se guarda la ventana vigente calculada: sale de `startDate` y de este
   * campo, así que reprogramar a una fecha posterior la corre sola.
   */
  @Column({ type: 'timestamp', precision: 3, nullable: true, default: null })
  refundWindowExtendedTo: Date | null;

  /** Por qué se extendió. Obligatorio al extender: es plata de terceros. */
  @Column({ type: 'varchar', length: 500, nullable: true, default: null })
  refundWindowReason: string | null;

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

  /**
   * Lineup estructurado (`BR-EVENT-016`): lista de artistas o actos, distinta
   * de la descripción libre. Cambiarla es un cambio material; reescribir la
   * descripción no.
   */
  @Column({ type: 'json', nullable: true, default: null })
  lineup: string[] | null;

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
