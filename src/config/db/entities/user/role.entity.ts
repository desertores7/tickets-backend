import { DB_NAME } from '@config/db/meta/db.const';
import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { UserRoleEntity } from './user_role.entity';

const tableName = 'role' as const;
@Entity(tableName, { database: DB_NAME.user, synchronize: false })
export class RoleEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

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
  @OneToMany(() => UserRoleEntity, userRole => userRole.role)
  userRoles: UserRoleEntity[];
}

export const RoleEntityData = {
  name: tableName,
  entity: RoleEntity
} as const;