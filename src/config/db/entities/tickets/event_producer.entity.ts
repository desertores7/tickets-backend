import { DB_NAME } from '@config/db/meta/db.const';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { UserEntity } from '../user/user.entity';
import { EventEntity } from './event.entity';

const tableName = 'event_producer' as const;

/**
 * Asignación puntual de un productor a un evento.
 * Es ADITIVA respecto del acceso por organización: un productor puede llegar a
 * un evento por pertenecer a la organización dueña, o por estar asignado acá
 * (caso del productor contratado para un show puntual).
 */
@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class EventProducerEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'char', length: 36 })
  eventUuid: string;

  @Column({ type: 'char', length: 36 })
  userUuid: string;

  @Column({ type: 'char', length: 36, nullable: true, default: null })
  assignedBy: string | null;

  @CreateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt: Date;

  // Relations
  @ManyToOne(() => EventEntity)
  @JoinColumn({ name: 'eventUuid', referencedColumnName: 'uuid' })
  event: EventEntity;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'userUuid', referencedColumnName: 'uuid' })
  user: UserEntity;
}

export const EventProducerEntityData = {
  name: tableName,
  entity: EventProducerEntity
} as const;
