import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { DB_NAME } from '@config/db/meta/db.const';
import { UserEntity } from '../user/user.entity';

const tableName = 'user_notification' as const;

@Entity(tableName, { database: DB_NAME.user, synchronize: false })
export class UserNotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'varchar', length: 36 })
  userUuid: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'timestamp', precision: 3, nullable: true, default: null })
  readAt: Date | null;

  @Column({ type: 'date', nullable: true, default: null })
  isDeleted: Date | null;

  @CreateDateColumn({ type: 'timestamp', precision: 3, nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamp',
    precision: 3,
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP(3)'
  })
  updatedAt: Date;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'userUuid', referencedColumnName: 'uuid' })
  user: UserEntity;
}

export const UserNotificationEntityData = {
  name: tableName,
  entity: UserNotificationEntity
} as const;
