import { DB_NAME } from '@config/db/meta/db.const';
import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { UserOrganizationEntity } from './user_organization.entity';
import type {
  OrganizationTaxCondition,
  OrganizationValidationStatus
} from '@modules/organization/const/organization-fiscal.const';

const tableName = 'organization' as const;
@Entity(tableName, { database: DB_NAME.user, synchronize: false })
export class OrganizationEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ default: 1 })
  active: number;

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

  @Column({ type: 'varchar', length: 50, nullable: true, default: null })
  contactPhone: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  contactEmail: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, default: null })
  verificationReference: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  bankAccount: string | null;

  @Column({
    type: 'enum',
    enum: ['draft_incomplete', 'pending_review', 'approved', 'rejected'],
    default: 'draft_incomplete'
  })
  validationStatus: OrganizationValidationStatus;

  @Column({ type: 'text', nullable: true, default: null })
  rejectionReason: string | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true, default: null })
  validationSubmittedAt: Date | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true, default: null })
  validationResolvedAt: Date | null;

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
