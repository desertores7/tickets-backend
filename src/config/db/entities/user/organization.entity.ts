import { DB_NAME } from '@config/db/meta/db.const';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { UserOrganizationEntity } from './user_organization.entity';
import { OrganizationStatusEntity } from './organization-status.entity';
import type { OrganizationTaxCondition } from '@modules/organization/const/organization-fiscal.const';

const tableName = 'organization' as const;

@Entity(tableName, { database: DB_NAME.user, synchronize: false })
export class OrganizationEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ default: 1 })
  active: number;

  @Column({ type: 'varchar', length: 36 })
  organizationStatusUuid: string;

  @Column({ type: 'text', nullable: true, default: null })
  rejectionReason: string | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true, default: null })
  validationSubmittedAt: Date | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true, default: null })
  validationResolvedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  legalName: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true, default: null })
  taxId: string | null;

  @Column({
    type: 'enum',
    enum: ['monotributo', 'responsable_inscripto', 'exento'],
    nullable: true,
    default: null
  })
  taxCondition: OrganizationTaxCondition | null;

  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  bankName: string | null;

  @Column({ type: 'varchar', length: 22, nullable: true, default: null })
  cbu: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  bankAlias: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  pendingBankName: string | null;

  @Column({ type: 'varchar', length: 22, nullable: true, default: null })
  pendingCbu: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  pendingBankAlias: string | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true, default: null })
  bankChangeRequestedAt: Date | null;

  @Column({ type: 'text', nullable: true, default: null })
  bankChangeRejectionReason: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  contactEmail: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, default: null })
  contactPhone: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  website: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  instagram: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  tiktok: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  facebook: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  socialX: string | null;

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

  @ManyToOne(() => OrganizationStatusEntity, status => status.organizations)
  @JoinColumn({ name: 'organizationStatusUuid', referencedColumnName: 'uuid' })
  organizationStatus: OrganizationStatusEntity;

  @OneToMany(() => UserOrganizationEntity, userOrganization => userOrganization.organization)
  userOrganizations: UserOrganizationEntity[];
}

export const OrganizationEntityData = {
  name: tableName,
  entity: OrganizationEntity
} as const;
