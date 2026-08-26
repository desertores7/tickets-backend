import { DB_NAME } from '@config/db/meta/db.const';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { EventMapSectorEntity } from './event_map_sector.entity';
import { TicketTypeEntity } from './ticket_type.entity';

const tableName = 'event_map_sector_ticket_type' as const;

@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class EventMapSectorTicketTypeEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  uuid: string;

  @Column({ type: 'varchar', length: 36 })
  sectorUuid: string;

  @Column({ type: 'varchar', length: 36 })
  ticketTypeUuid: string;

  @ManyToOne(() => EventMapSectorEntity, sector => sector.ticketTypeLinks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sectorUuid', referencedColumnName: 'uuid' })
  sector: EventMapSectorEntity;

  @ManyToOne(() => TicketTypeEntity)
  @JoinColumn({ name: 'ticketTypeUuid', referencedColumnName: 'uuid' })
  ticketType: TicketTypeEntity;
}

export const EventMapSectorTicketTypeEntityData = {
  name: tableName,
  entity: EventMapSectorTicketTypeEntity
} as const;
