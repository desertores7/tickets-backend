import { DB_NAME } from '@config/db/meta/db.const';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { UserEntity } from './user.entity';

const tableName = 'user_session' as const;

@Entity(tableName, { database: DB_NAME.user, synchronize: false })
export class UserSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'char', length: 36, nullable: true, default: null })
  userUuid: string | null;

  @Column({ type: 'varchar', length: 6 })
  code: string;

  @Column({ type: 'boolean', default: false })
  isUsed: boolean;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @CreateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt: Date;

  // Relations
  @ManyToOne(() => UserEntity, user => user.userSessions, { nullable: true })
  @JoinColumn({ name: 'userUuid', referencedColumnName: 'uuid' })
  user?: UserEntity | null;
}

export const UserSessionEntityData = {
  name: tableName,
  entity: UserSessionEntity
} as const;
