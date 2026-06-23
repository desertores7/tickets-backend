import { DB_NAME } from '@config/db/meta/db.const';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { UserEntity } from './user.entity';
import { RoleEntity } from './role.entity';

const tableName = 'user_role' as const;
@Entity(tableName, { database: DB_NAME.user, synchronize: false })
export class UserRoleEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'char' })
  userUuid: string;

  @Column({ type: 'char' })
  roleUuid: string;

  @Column({ type: 'date', nullable: true, default: null })
  isDeleted: Date | null;

  @CreateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  updatedAt: Date;

  @Column({ type: 'varchar', nullable: true, default: null })
  createdBy: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  updatedBy: string | null;

  //Relations
  @ManyToOne(() => UserEntity, user => user.userRoles)
  @JoinColumn({ name: 'userUuid', referencedColumnName: 'uuid' })
  user: UserEntity;

  @ManyToOne(() => RoleEntity, role => role.userRoles)
  @JoinColumn({ name: 'roleUuid', referencedColumnName: 'uuid' })
  role: RoleEntity;
}

export const UserRoleEntityData = {
  name: tableName,
  entity: UserRoleEntity
} as const;