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
import { OrganizationEntity } from './organization.entity';
import type {
  OrganizationRequestPayload,
  OrganizationRequestStatus,
  OrganizationRequestType
} from '@modules/organization/const/organization-request.const';

const tableName = 'organization_request' as const;

@Entity(tableName, { database: DB_NAME.user, synchronize: false })
export class OrganizationRequestEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  uuid: string;

  @Column({ type: 'varchar', length: 36 })
  organizationUuid: string;

  @Column({ type: 'enum', enum: ['bank_change', 'fiscal_change'] })
  type: OrganizationRequestType;

  @Column({
    type: 'enum',
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  })
  status: OrganizationRequestStatus;

  /** Valores propuestos (banco o identidad fiscal). */
  @Column({ type: 'json' })
  payload: OrganizationRequestPayload;

  @Column({ type: 'text', nullable: true, default: null })
  rejectionReason: string | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true, default: null })
  resolvedAt: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  resolvedByUuid: string | null;

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

  @ManyToOne(() => OrganizationEntity)
  @JoinColumn({ name: 'organizationUuid', referencedColumnName: 'uuid' })
  organization: OrganizationEntity;
}

export const OrganizationRequestEntityData = {
  name: tableName,
  entity: OrganizationRequestEntity
} as const;
