import { DB_NAME } from '@config/db/meta/db.const';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { OrganizationEntity } from './organization.entity';
import type { OrganizationActivityKind } from '@modules/organization/const/organization-activity.const';

const tableName = 'organization_activity' as const;

@Entity(tableName, { database: DB_NAME.user, synchronize: false })
export class OrganizationActivityEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  uuid: string;

  @Column({ type: 'varchar', length: 36 })
  organizationUuid: string;

  @Column({
    type: 'enum',
    enum: [
      'identity_saved',
      'bank_saved',
      'docs_uploaded',
      'validation_submitted',
      'validation_withdrawn',
      'validation_approved',
      'validation_rejected',
      'bank_change_requested',
      'bank_change_approved',
      'bank_change_rejected',
      'fiscal_change_requested',
      'fiscal_change_approved',
      'fiscal_change_rejected'
    ]
  })
  kind: OrganizationActivityKind;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'varchar', length: 500, nullable: true, default: null })
  detail: string | null;

  @Column({ type: 'json', nullable: true, default: null })
  payload: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  actorUserUuid: string | null;

  @CreateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt: Date;

  @ManyToOne(() => OrganizationEntity)
  @JoinColumn({ name: 'organizationUuid', referencedColumnName: 'uuid' })
  organization: OrganizationEntity;
}

export const OrganizationActivityEntityData = {
  name: tableName,
  entity: OrganizationActivityEntity
} as const;
