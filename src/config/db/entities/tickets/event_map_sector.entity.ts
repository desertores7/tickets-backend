import { DB_NAME } from '@config/db/meta/db.const';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn
} from 'typeorm';
import { EventMapEntity } from './event_map.entity';
import { EventMapSectorTicketTypeEntity } from './event_map_sector_ticket_type.entity';

const tableName = 'event_map_sector' as const;

/** Geometría de sector en coords normalizadas 0–1 sobre el canvas. */
export type EventMapSectorGeometry =
  | {
      type: 'rect';
      x: number;
      y: number;
      w: number;
      h: number;
      color?: string;
    }
  | {
      type: 'ellipse';
      x: number;
      y: number;
      w: number;
      h: number;
      color?: string;
    }
  | {
      type: 'polygon';
      points: Array<{ x: number; y: number }>;
      color?: string;
    };

@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class EventMapSectorEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  uuid: string;

  @Column({ type: 'varchar', length: 36 })
  mapUuid: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'json' })
  geometry: EventMapSectorGeometry;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'boolean', default: false })
  isNumbered: boolean;

  @Column({ type: 'int', nullable: true, default: null })
  capacity: number | null;

  @CreateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  updatedAt: Date;

  @ManyToOne(() => EventMapEntity, map => map.sectors)
  @JoinColumn({ name: 'mapUuid', referencedColumnName: 'uuid' })
  map: EventMapEntity;

  @OneToMany(() => EventMapSectorTicketTypeEntity, link => link.sector)
  ticketTypeLinks: EventMapSectorTicketTypeEntity[];
}

export const EventMapSectorEntityData = {
  name: tableName,
  entity: EventMapSectorEntity
} as const;
