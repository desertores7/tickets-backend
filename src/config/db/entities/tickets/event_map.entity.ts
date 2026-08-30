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
import { EventEntity } from './event.entity';
import { EventMapSectorEntity } from './event_map_sector.entity';

const tableName = 'event_map' as const;

@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class EventMapEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  uuid: string;

  @Column({ type: 'varchar', length: 36, unique: true })
  eventUuid: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 1000, nullable: true, default: null })
  baseImageUrl: string | null;

  @Column({ type: 'int', default: 1000 })
  canvasWidth: number;

  @Column({ type: 'int', default: 1000 })
  canvasHeight: number;

  @CreateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  updatedAt: Date;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  createdBy: string | null;

  @ManyToOne(() => EventEntity)
  @JoinColumn({ name: 'eventUuid', referencedColumnName: 'uuid' })
  event: EventEntity;

  @OneToMany(() => EventMapSectorEntity, sector => sector.map)
  sectors: EventMapSectorEntity[];
}

export const EventMapEntityData = {
  name: tableName,
  entity: EventMapEntity
} as const;
