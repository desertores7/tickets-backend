import { DB_NAME } from '@config/db/meta/db.const';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { UserEntity } from '../user/user.entity';
import { EventEntity } from './event.entity';

const tableName = 'event_validator' as const;

/**
 * Personal de puerta asignado a un evento puntual.
 *
 * A diferencia de event_producer, esta tabla NO da acceso al backoffice: solo
 * registra quién trabaja la puerta de qué show. El rol `Validador` se otorga al
 * asignar (un validador arranca como cuenta Cliente) y no se quita al
 * desasignar, porque la persona puede seguir asignada a otros eventos.
 */
@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class EventValidatorEntity {
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

export const EventValidatorEntityData = {
  name: tableName,
  entity: EventValidatorEntity
} as const;
