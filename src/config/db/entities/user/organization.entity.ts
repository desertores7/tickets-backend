import { DB_NAME } from '@config/db/meta/db.const';
import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { UserOrganizationEntity } from './user_organization.entity';

const tableName = 'organization' as const;
@Entity(tableName, { database: DB_NAME.user, synchronize: false })
export class OrganizationEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ default: 1 })
  active: number;

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

  @OneToMany(() => UserOrganizationEntity, userOrganization => userOrganization.organization)
  userOrganizations: UserOrganizationEntity[];

}

export const OrganizationEntityData = {
  name: tableName,
  entity: OrganizationEntity
} as const;
