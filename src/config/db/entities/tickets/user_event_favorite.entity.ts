import { DB_NAME } from '@config/db/meta/db.const';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn
} from 'typeorm';
import { UserEntity } from '../user/user.entity';
import { EventEntity } from './event.entity';

const tableName = 'user_event_favorite' as const;

@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class UserEventFavoriteEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  uuid: string;

  @Column({ type: 'varchar', length: 36 })
  userUuid: string;

  @Column({ type: 'varchar', length: 36 })
  eventUuid: string;

  @Column({ type: 'date', nullable: true, default: null })
  isDeleted: Date | null;

  @CreateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  updatedAt: Date;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'userUuid', referencedColumnName: 'uuid' })
  user: UserEntity;

  @ManyToOne(() => EventEntity)
  @JoinColumn({ name: 'eventUuid', referencedColumnName: 'uuid' })
  event: EventEntity;
}

export const UserEventFavoriteEntityData = {
  name: tableName,
  entity: UserEventFavoriteEntity
} as const;
