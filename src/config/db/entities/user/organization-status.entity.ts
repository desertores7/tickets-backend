import { DB_NAME } from '@config/db/meta/db.const';
import { Column, CreateDateColumn, Entity, OneToMany, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { OrganizationEntity } from './organization.entity';

const tableName = 'organization_status' as const;

@Entity(tableName, { database: DB_NAME.user, synchronize: false })
export class OrganizationStatusEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  uuid: string;

  @Column({ type: 'varchar', length: 50 })
  name: string;

  @Column({ type: 'date', nullable: true, default: null })
  isDeleted: Date | null;

  @CreateDateColumn({ type: 'timestamp', precision: 3, nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', precision: 3, nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  updatedAt: Date;

  @Column({ type: 'varchar', nullable: true, default: null })
  createdBy: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  updatedBy: string | null;

  @OneToMany(() => OrganizationEntity, org => org.organizationStatus)
  organizations: OrganizationEntity[];
}

export const OrganizationStatusEntityData = {
  name: tableName,
  entity: OrganizationStatusEntity
} as const;
